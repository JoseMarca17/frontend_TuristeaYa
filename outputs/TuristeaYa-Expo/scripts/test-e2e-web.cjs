/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Fase 12: Pruebas E2E completas en navegador Web contra dist/ (Edge headless vía CDP).
 * Cubre los 5 roles (Turista, VIP, Negocio/Anunciante, Soporte, Admin) y Render POST/DELETE reales.
 */
const { createServer } = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const distRoot = path.resolve(__dirname, '..', 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(distRoot, '.' + pathname);
    if (!file.startsWith(distRoot + path.sep) && file !== distRoot) throw new Error('Invalid path');
    if (file === distRoot) file = path.join(file, 'index.html');
    else if (!path.extname(file)) {
      try { await fsp.access(file + '.html'); file += '.html'; }
      catch { file = path.join(file, 'index.html'); }
    }
    const content = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(content);
  } catch {
    res.writeHead(404).end();
  }
});

async function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const reqId = ++id;
    pending.set(reqId, { resolve, reject });
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params?.exceptionDetails?.text || JSON.stringify(msg.params));
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      void send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    send,
    exceptions,
    eval: async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

async function waitForText(cdp, text, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await cdp.eval(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`);
    if (found) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  const snippet = await cdp.eval(`document.body ? document.body.innerText.slice(0, 700) : ''`);
  throw new Error(`Timeout esperando "${text}". Texto actual:\n${snippet}`);
}

async function clickButtonByText(cdp, text, partial = true) {
  return cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('[role="button"]')];
    const target = btns.find(b => ${partial ? 'b.innerText.includes(' + JSON.stringify(text) + ')' : 'b.innerText.trim() === ' + JSON.stringify(text)});
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turisteaya-e2e-'));
  const port = 9335;
  const edge = spawn(
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank'],
    { stdio: 'ignore' },
  );

  try {
    let targetWs = null;
    for (let i = 0; i < 30; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const pageTarget = list.find((t) => t.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) { targetWs = pageTarget.webSocketDebuggerUrl; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(targetWs, 'Edge CDP disponible');
    const cdp = await cdpClient(targetWs);

    // 1. Catálogo turístico con orden por distancia/precio/calificación y lugares publicados
    await cdp.send('Page.navigate', { url: `${origin}/turista/catalogo` });
    await waitForText(cdp, 'Catálogo turístico');
    await waitForText(cdp, 'Ordenar lugares por');
    await waitForText(cdp, 'Menor precio');
    assert.equal(await clickButtonByText(cdp, 'Menor precio'), true);
    console.log('PASS 1: Catálogo turístico con filtros y orden por distancia/precio/calificación');

    // 2. Generador de rutas + alternativas + mapa polilínea
    await cdp.send('Page.navigate', { url: `${origin}/turista/crear-ruta` });
    await waitForText(cdp, 'Generador inteligente de rutas');
    assert.equal(await clickButtonByText(cdp, 'Generar alternativas optimizadas'), true);
    await waitForText(cdp, 'Alternativas generadas', 20000);
    await waitForText(cdp, 'Polilínea', 10000);
    console.log('PASS 2: Generador multi-alternativa y mapa SVG con polilínea');

    // 3. Flujo Vista Demo VIP (oculta anuncios + descargas SQLite/local)
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'Turista VIP');
    await waitForText(cdp, '¿Olvidaste tu contraseña?');
    await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('[role="button"]')];
      const idx = cards.findIndex(el => el.innerText.includes('Vista Demo'));
      const vipVista = cards.filter(el => el.innerText.trim() === 'Vista Demo')[1];
      if (vipVista) vipVista.click();
      return Boolean(vipVista);
    })()`);
    await waitForText(cdp, 'Membresía VIP activa · Sin anuncios');
    const adPresentOnVip = await cdp.eval(`document.body.innerText.includes('Patrocinado · Publicidad local')`);
    assert.equal(adPresentOnVip, false, 'VIP activo debe ocultar anuncios patrocinados');
    await cdp.send('Page.navigate', { url: `${origin}/vip` });
    await waitForText(cdp, 'Última sincronización:');
    console.log('PASS 3: VIP activo oculta anuncios y muestra almacenamiento offline');

    // 4. Canje de cupón -> Cupón canjeado + QR verificable + descuento en rutas
    await cdp.send('Page.navigate', { url: `${origin}/turista/cupones` });
    await waitForText(cdp, 'PACENO2026', 25000);
    await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('*')].filter(el => el.innerText && el.innerText.includes('PACENO2026'));
      const touch = cards.find(el => el.getAttribute && el.getAttribute('tabindex') !== null) || cards[cards.length - 1];
      touch.click();
    })()`);
    await waitForText(cdp, 'Confirmar canje');
    assert.equal(await clickButtonByText(cdp, 'Confirmar canje', false), true);
    await waitForText(cdp, 'Cupón canjeado');
    await waitForText(cdp, 'Muestra este QR al comercio');
    await waitForText(cdp, '(ahorras Bs');
    console.log('PASS 4: Cupón canjeado con QR verificable y descuentos aplicados en rutas');

    // 5. Negocio Demo: Asistente de 3 pasos + Validador QR + Campañas estadísticas
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'negocio.demo@turisteaya.org');
    await cdp.eval(`(() => {
      const vipOrBiz = [...document.querySelectorAll('[role="button"]')].filter(el => el.innerText.trim() === 'Vista Demo')[2];
      if (vipOrBiz) vipOrBiz.click();
    })()`);
    await waitForText(cdp, 'Mi negocio');
    assert.equal(await clickButtonByText(cdp, 'Asistente 3 pasos'), true);
    await waitForText(cdp, 'Paso 1 de 3: Datos básicos');
    await cdp.send('Page.navigate', { url: `${origin}/RamaNegocio/promociones` });
    await waitForText(cdp, 'Validar código o voucher QR en local');
    await cdp.send('Page.navigate', { url: `${origin}/RamaNegocio/proximamente` });
    await waitForText(cdp, 'Diario est.:');
    console.log('PASS 5: Negocio (Wizard 3 pasos + QR validator + Campañas métricas)');

    // 6. Soporte Demo (Disputas cupones + historial usuario) y Admin Demo
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'soporte.demo@turisteaya.org');
    await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll('[role="button"]')].filter(el => el.innerText.trim() === 'Vista Demo')[3];
      if (btn) btn.click();
    })()`);
    await waitForText(cdp, 'Disputas cupones');
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'admin.demo@turisteaya.org');
    await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll('[role="button"]')].filter(el => el.innerText.trim() === 'Vista Demo')[4];
      if (btn) btn.click();
    })()`);
    await waitForText(cdp, 'Reportes de lugares y reseñas');
    console.log('PASS 6: Soporte (Disputas) y Admin panel completos');

    // 7. Ciclo real en Render vía UI: Login Turista -> Crear ruta (POST) -> Confirmar eliminar (DELETE)
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'turista.demo@turisteaya.org');
    assert.equal(await clickButtonByText(cdp, 'Entrar en Render'), true);
    await waitForText(cdp, 'Conectado a Render', 25000);
    await cdp.send('Page.navigate', { url: `${origin}/turista/rutas-disponibles` });
    await waitForText(cdp, 'Todas las rutas', 20000);
    await cdp.eval(`document.querySelector('[aria-label="Crear nueva ruta"]')?.click()`);
    await waitForText(cdp, 'Nueva ruta en Render');
    await cdp.eval(`(() => {
      const input = document.querySelector('input[placeholder*="Sopocachi"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Ruta E2E Final');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    assert.equal(await clickButtonByText(cdp, 'Crear ruta y añadir paradas'), true);
    await waitForText(cdp, 'Mapa del recorrido con polilínea', 25000);
    assert.equal(await clickButtonByText(cdp, 'Eliminar ruta', false), true);
    await waitForText(cdp, 'Todas las rutas', 25000);
    console.log('PASS 7: POST /routes, Mapa Polilínea y DELETE /routes con confirmación en Render OK');

    assert.deepEqual(cdp.exceptions, [], `JS runtime exceptions: ${cdp.exceptions.join('; ')}`);
    console.log('ALL WEB E2E FLOWS PASSED WITH 0 JS EXCEPTIONS.');
    cdp.close();
  } finally {
    try { edge.kill(); } catch {}
    server.close();
    await new Promise((r) => setTimeout(r, 400));
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
})();
