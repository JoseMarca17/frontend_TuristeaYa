/**
 * Fase 12: Pruebas de integración contra Render desplegado (turista.demo@turisteaya.org).
 * Verifica Auth, RLS, rutas, paradas, reseñas, tickets, catálogos y limpieza automática.
 */
const assert = require('node:assert/strict');
const BASE = 'https://backend-turisteaya.onrender.com/api/v1';

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, data: json };
}

(async () => {
  console.log('=== Pruebas de Integración Render (Fase 12) ===');

  // 1. Sin token, rutas privadas deben rechazar 401
  const unauthTickets = await api('/tickets');
  assert.equal(unauthTickets.status, 401, 'GET /tickets sin token debe devolver 401');
  console.log('  PASS: RLS/Auth bloquea privados sin sesión (401)');

  // 2. Autenticación
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: 'turista.demo@turisteaya.org', password: 'TuristeaDemo2026!' },
  });
  assert.equal(login.status, 200, 'Login demo turista debe retornar 200');
  const token = login.data.access_token;
  const userId = login.data.user.id;
  assert.ok(token && userId);
  console.log('  PASS: POST /auth/login');

  // 3. Catálogo público publicado
  const placesRes = await api('/places?limit=50');
  assert.equal(placesRes.status, 200);
  assert.ok(Array.isArray(placesRes.data) && placesRes.data.length > 0);
  const myRevsRes = await api(`/reviews?user_id=${userId}&limit=50`, { token });
  const reviewedIds = new Set((Array.isArray(myRevsRes.data) ? myRevsRes.data : []).map((r) => r.place_id));
  const targetPlaceId = (placesRes.data.find((p) => !reviewedIds.has(p.id)) || placesRes.data[0]).id;
  console.log(`  PASS: GET /places (${placesRes.data.length} lugares)`);

  // 4. RLS seguridad: turista no puede elevar su propio rol en /user-access
  const uaRes = await api(`/user-access?user_id=${userId}`, { token });
  assert.equal(uaRes.status, 200);
  const myAccess = uaRes.data[0];
  const elevateRes = await api(`/user-access/${myAccess.id}`, {
    token,
    method: 'PATCH',
    body: { role: 'admin' },
  });
  assert.ok([403, 404, 422].includes(elevateRes.status), `Esperado 403/404 al intentar auto-asignar admin, recibido ${elevateRes.status}`);
  console.log(`  PASS: RLS impide auto-escalación de rol (${elevateRes.status})`);

  // 5. Ciclo completo ruta + parada + reordenamiento + limpieza
  const routeCreate = await api('/routes', {
    token,
    method: 'POST',
    body: {
      user_id: userId,
      name: '[INT_TEST] Circuito Automático',
      budget: 150,
      available_minutes: 120,
      origin_lat: -16.4955,
      origin_lng: -68.1336,
      visibility: 'private',
    },
  });
  assert.equal(routeCreate.status, 201, `POST /routes falló: ${JSON.stringify(routeCreate.data)}`);
  const routeId = routeCreate.data.id;
  const stopCreate = await api('/route-stops', {
    token,
    method: 'POST',
    body: { route_id: routeId, place_id: targetPlaceId, position: 1, visit_minutes: 40, estimated_cost: 15 },
  });
  assert.equal(stopCreate.status, 201);
  const routePatch = await api(`/routes/${routeId}`, { token, method: 'PATCH', body: { budget: 175 } });
  assert.equal(routePatch.status, 200);
  const routeDel = await api(`/routes/${routeId}`, { token, method: 'DELETE' });
  assert.ok([200, 204].includes(routeDel.status));
  console.log('  PASS: Ciclo completo POST/PATCH/DELETE rutas y paradas');

  // 6. Ciclo reseña (maneja restricción 1 reseña por usuario+lugar)
  const revCreate = await api('/reviews', {
    token,
    method: 'POST',
    body: { place_id: targetPlaceId, user_id: userId, rating: 5, body: '[INT_TEST] Reseña verificada' },
  });
  if (revCreate.status === 201) {
    const revPatch = await api(`/reviews/${revCreate.data.id}`, {
      token,
      method: 'PATCH',
      body: { rating: 4, body: '[INT_TEST] Reseña actualizada' },
    });
    assert.equal(revPatch.status, 200);
    const revDel = await api(`/reviews/${revCreate.data.id}`, { token, method: 'DELETE' });
    assert.ok([200, 204].includes(revDel.status));
    console.log('  PASS: Ciclo completo POST/PATCH/DELETE reseña');
  } else {
    assert.equal(revCreate.status, 409, `Status inesperado en /reviews: ${revCreate.status}`);
    console.log('  PASS: Unicidad (user_id, place_id) en /reviews verificada (409)');
  }

  // 7. Ciclo ticket y mensaje
  const ticketCreate = await api('/tickets', {
    token,
    method: 'POST',
    body: {
      user_id: userId,
      place_id: targetPlaceId,
      kind: 'other',
      priority: 'medium',
      subject: '[INT_TEST] Reporte automático',
      description: 'Verificación automatizada de tickets',
    },
  });
  assert.equal(ticketCreate.status, 201);
  const msgCreate = await api('/ticket-messages', {
    token,
    method: 'POST',
    body: { ticket_id: ticketCreate.data.id, sender_id: userId, body: 'Detalle adicional de prueba' },
  });
  assert.equal(msgCreate.status, 201);
  await api(`/tickets/${ticketCreate.data.id}`, { token, method: 'DELETE' });
  console.log('  PASS: Ciclo completo POST/DELETE ticket y mensaje');

  console.log('ALL RENDER INTEGRATION TESTS PASSED.');
})().catch((err) => {
  console.error('INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
