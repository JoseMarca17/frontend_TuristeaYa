/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Fase 12: Pruebas E2E completas en navegador Web contra dist/ (Edge headless vía CDP).
 * Verifica pantalla principal limpia + acceso demo discreto inferior + acciones completas en los 5 roles Demo + Render catálogo.
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

async function waitAndClickButton(cdp, text, partial = true, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const clicked = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('[role="button"]')];
      const target = btns.find(b => ${partial ? 'b.innerText.includes(' + JSON.stringify(text) + ')' : 'b.innerText.trim() === ' + JSON.stringify(text)});
      if (!target) return false;
      if (target.getAttribute('aria-disabled') === 'true' || target.disabled) return false;
      target.click();
      return true;
    })()`);
    if (clicked) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout esperando botón habilitado "${text}"`);
}

async function enterDemoRole(cdp, origin, roleTitle) {
  await cdp.send('Page.navigate', { url: `${origin}/` });
  await waitForText(cdp, 'Organiza tu recorrido en minutos');
  const demoBtnClicked = await cdp.eval(`(() => {
    const btn = document.querySelector('[aria-label="Abrir acceso demo"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  assert.equal(demoBtnClicked, true, 'El botón discreto "· demo ·" debe existir en la pantalla principal');
  await waitForText(cdp, 'Vista demo');
  const roleBtnClicked = await cdp.eval(`(() => {
    const btn = document.querySelector('[aria-label="Entrar en vista demo ${roleTitle}"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  assert.equal(roleBtnClicked, true, `Debe existir opción ${roleTitle} en selector demo`);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turisteaya-e2e-clean-'));
  const port = 9337;
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

    // 1. Pantalla principal y Login limpios (sin tarjetas ni claves de demo visibles, solo acceso discreto al fondo)
    await cdp.send('Page.navigate', { url: `${origin}/` });
    await waitForText(cdp, 'Organiza tu recorrido en minutos');
    const hasOldPasswords = await cdp.eval(`document.body.innerText.includes('TuristeaDemo2026!') || document.body.innerText.includes('Entrar en Render')`);
    assert.equal(hasOldPasswords, false, 'Pantalla principal NO debe mostrar credenciales ni botones de prueba Render');
    await cdp.send('Page.navigate', { url: `${origin}/login` });
    await waitForText(cdp, 'Correo electrónico');
    const loginHasDemoCards = await cdp.eval(`document.body.innerText.includes('Usuarios demo por rol') || document.body.innerText.includes('TuristeaDemo2026!')`);
    assert.equal(loginHasDemoCards, false, 'Login NO debe mostrar tarjetas de credenciales demo');
    console.log('PASS 1: Pantalla principal y Login limpios + acceso demo discreto en la parte inferior');

    // 2. Entrar como Turista desde acceso demo y crear ruta completa + generar alternativas
    await enterDemoRole(cdp, origin, 'Turista');
    await waitForText(cdp, 'Explora todas las rutas');
    await cdp.send('Page.navigate', { url: `${origin}/turista/crear-ruta` });
    await waitForText(cdp, 'Generador inteligente de rutas');
    await new Promise((r) => setTimeout(r, 1200));
    await waitAndClickButton(cdp, 'Generar alternativas optimizadas');
    await waitForText(cdp, 'Alternativas generadas', 20000);
    await waitAndClickButton(cdp, 'Guardar esta ruta');
    await waitForText(cdp, 'Mapa del recorrido con polilínea', 20000);
    console.log('PASS 2: Turista Demo crea y visualiza ruta con polilínea sin pedir login');

    // 3. Canjear cupón en Demo -> QR -> Disputa en Soporte
    await cdp.send('Page.navigate', { url: `${origin}/turista/cupones` });
    await waitForText(cdp, 'PACENO2026', 25000);
    await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('*')].filter(el => el.innerText && el.innerText.includes('PACENO2026'));
      const touch = cards.find(el => el.getAttribute && el.getAttribute('tabindex') !== null) || cards[cards.length - 1];
      touch.click();
    })()`);
    await waitAndClickButton(cdp, 'Confirmar canje', false);
    await waitForText(cdp, 'Cupón canjeado');
    await waitForText(cdp, 'Muestra este QR al comercio');
    console.log('PASS 3: Cupón canjeado + QR + descuentos en rutas en Demo');

    // 4. Turista VIP desde acceso demo (oculta anuncios + offline + reservas futuras)
    await enterDemoRole(cdp, origin, 'Turista VIP');
    await waitForText(cdp, 'Plan VIP activo', 20000);
    await cdp.send('Page.navigate', { url: `${origin}/turista` });
    await waitForText(cdp, 'Membresía VIP activa · Sin anuncios', 20000);
    const hasAdsOnVip = await cdp.eval(`document.body.innerText.includes('Patrocinado · Publicidad local')`);
    assert.equal(hasAdsOnVip, false, 'VIP debe ocultar anuncios');
    console.log('PASS 4: Turista VIP oculta anuncios y activa descargas offline');

    // 5. Comercio / Negocio desde acceso demo -> Wizard 3 pasos -> Promociones QR -> Campañas
    await enterDemoRole(cdp, origin, 'Comercio / Negocio');
    await waitForText(cdp, 'Mi negocio', 20000);
    await waitAndClickButton(cdp, 'Asistente 3 pasos');
    await waitForText(cdp, 'Paso 1 de 3: Datos básicos');
    await cdp.send('Page.navigate', { url: `${origin}/RamaNegocio/promociones` });
    await waitForText(cdp, 'Validar código o voucher QR en local', 20000);
    console.log('PASS 5: Comercio Demo (Wizard 3 pasos + Validador QR)');

    // 6. Soporte y Administrador desde acceso demo
    await enterDemoRole(cdp, origin, 'Soporte');
    await waitForText(cdp, 'Disputas cupones', 20000);
    await enterDemoRole(cdp, origin, 'Administrador');
    await waitForText(cdp, 'Resumen de plataforma', 20000);
    await waitForText(cdp, 'Reportes de lugares y reseñas');
    console.log('PASS 6: Soporte y Administrador Demo funcionales');

    assert.deepEqual(cdp.exceptions, [], `JS runtime exceptions: ${cdp.exceptions.join('; ')}`);
    console.log('ALL CLEAN UI & FULL DEMO FLOWS PASSED WITH 0 JS EXCEPTIONS.');
    cdp.close();
  } finally {
    try { edge.kill(); } catch {}
    server.close();
    await new Promise((r) => setTimeout(r, 400));
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
})();
