const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE || __filename)('playwright');
const root = path.resolve(__dirname, '../dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) throw new Error('Invalid path');
    if (file === root) file = path.join(file, 'index.html');
    else if (!path.extname(file)) {
      try { await fs.access(file + '.html'); file += '.html'; }
      catch { file = path.join(file, 'index.html'); }
    }
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], writes = [];
    const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com' };
    const ticket = { id: '00000000-0000-4000-8000-000000000002', user_id: user.id, subject: 'Caso de prueba', description: 'Consulta', status: 'pending', priority: 'medium' };
    const business = { id: '00000000-0000-4000-8000-000000000003', owner_id: user.id, name: 'Negocio de prueba' };
    const messages = [];
    let reservationAttempts = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://backend-turisteaya.onrender.com/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      const entity = pathname.split('/')[3];
      let data = [];
      if (/auth\/(login|refresh)$/.test(pathname)) data = { access_token: 'fixture', refresh_token: 'refresh', user };
      else if (entity === 'user-access') data = [{ id: 'access', user_id: user.id, role: 'admin', status: 'active' }];
      else if (entity === 'me') data = { ...user, full_name: 'Cuenta de prueba' };
      else if (entity === 'tickets') data = [ticket];
      else if (entity === 'ticket-messages') data = messages;
      else if (entity === 'businesses') data = [business];
      else if (entity === 'promotions') data = [{ id: '00000000-0000-4000-8000-000000000004', title: 'Cupón de prueba', status: 'active', starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', discount_percent: 20 }];
      else if (entity === 'experiences') data = [{ id: '00000000-0000-4000-8000-000000000005', title: 'Experiencia de prueba', published: true, starts_at: '2099-01-01T00:00:00Z', price_per_person: 25, vip_only: false }];
      if (['PATCH', 'POST'].includes(req.method()) && !pathname.includes('/auth/')) {
        const body = req.postDataJSON(); writes.push({ pathname, body });
        if (pathname.endsWith('/reserve') && reservationAttempts++ === 0) {
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Fallo temporal de prueba' }) });
          return;
        }
        if (entity === 'tickets') { Object.assign(ticket, body); data = ticket; }
        else if (entity === 'ticket-messages') { data = { id: 'message', created_at: new Date().toISOString(), ...body }; messages.push(data); }
        else data = { id: 'saved', ...body };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin + '/login');
    await page.getByPlaceholder('usuario@ejemplo.com').fill('test@example.com');
    await page.locator('input[type=password]').fill('Test-password-1');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL('**/turista');
    await page.goto(origin + '/soporte');
    await page.getByText('Caso de prueba', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver conversación', exact: true }).click();
    await page.locator('textarea').fill('Respuesta de prueba');
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    await page.getByText('Respuesta de prueba', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resolver caso', exact: true }).click();
    await page.getByText(/resolved · medium/).waitFor();
    for (const pathname of ['/admin', '/RamaNegocio', '/RamaNegocio/promociones', '/RamaNegocio/proximamente', '/RamaNegocio/datos', '/turista/cuenta', '/turista/notificaciones', '/turista/experiencias', '/vip']) {
      await page.goto(origin + pathname);
      await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
    }
    assert.ok(writes.some(write => write.body.body === 'Respuesta de prueba'));
    assert.ok(writes.some(write => write.body.status === 'resolved'));
    await page.goto(origin + '/turista/experiencias');
    await page.getByRole('button', { name: 'Reservar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click();
    await page.getByText('Fallo temporal de prueba', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click();
    await page.getByText('Reserva confirmada. Consulta los detalles en Mi cuenta.', { exact: true }).waitFor();
    const reservations = writes.filter(write => write.pathname.endsWith('/reserve'));
    assert.equal(reservations.length, 2);
    assert.equal(reservations[0].body.request_key, reservations[1].body.request_key);
    assert.equal(reservations[0].body.people, 1);
    await page.goto(origin + '/turista/cupones');
    await page.getByText('Cupón de prueba', { exact: true }).click();
    await page.locator('input').fill('100');
    await page.getByRole('button', { name: 'Confirmar canje', exact: true }).click();
    await page.getByText('Cupón canjeado. Consulta el historial en Usados.', { exact: true }).waitFor();
    assert.equal(writes.find(write => write.pathname.endsWith('/redeem')).body.purchase_amount, 100);
    assert.deepEqual(errors, []);
    console.log('PASS: login, restauración, soporte, nueve paneles, reserva con reintento idempotente y canje; API simulada, sin errores JS.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
