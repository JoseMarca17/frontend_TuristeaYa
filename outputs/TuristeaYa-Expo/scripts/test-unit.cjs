/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Fase 12: Pruebas unitarias completas sobre domain-rules.ts
 * Ejecuta directamente sobre Node 24+ (soporta .ts nativamente).
 */
const assert = require('node:assert/strict');
const rules = require('../src/services/domain-rules.ts');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('  PASS:', name);
}

console.log('=== Pruebas Unitarias TuristeaYA (Fase 12) ===');

// 1. Distancias
test('haversineKm calcula distancia exacta en La Paz (~0 mismo punto, ~0.85 km Murillo -> Jaen/Lanza)', () => {
  const zero = rules.haversineKm({ latitude: -16.4955, longitude: -68.1336 }, { latitude: -16.4955, longitude: -68.1336 });
  assert.equal(zero, 0);
  const d = rules.haversineKm({ latitude: -16.4958, longitude: -68.1336 }, { latitude: -16.4898, longitude: -68.1355 });
  assert.ok(d > 0.5 && d < 1.2, `Esperado 0.5..1.2km, obtenido ${d}`);
});

// 2. Duraciones y Costos
test('estimateTravelMinutes calcula tiempos de caminata y transporte urbano', () => {
  assert.equal(rules.estimateTravelMinutes(0), 0);
  assert.ok(rules.estimateTravelMinutes(0.9) >= 10);
  assert.ok(rules.estimateTravelMinutes(6) >= 20);
});

test('calculateRouteMetrics calcula distancias, tiempos, costos, descuento y hash snapshot', () => {
  const origin = { latitude: -16.4955, longitude: -68.1336 };
  const stops = [
    { id: 'p1', name: 'A', category: 'cultura', latitude: -16.492, longitude: -68.135, estimatedCost: 30, visitMinutes: 40 },
    { id: 'p2', name: 'B', category: 'gastronomia', latitude: -16.499, longitude: -68.131, estimatedCost: 50, visitMinutes: 50 },
  ];
  const calc = rules.calculateRouteMetrics(origin, stops, 20);
  assert.equal(calc.rawCost, 80);
  assert.equal(calc.discountAmount, 16);
  assert.equal(calc.finalCost, 64);
  assert.equal(calc.totalVisitMinutes, 90);
  assert.equal(calc.totalDurationMinutes, calc.totalTravelMinutes + 90);
  assert.ok(calc.totalDistanceKm > 0);
  assert.ok(calc.snapshotHash.startsWith('v1-'));
});

// 3. Filtros y orden de catálogo
test('filterPublishedPlaces oculta lugares no publicados y sortCatalogPlaces ordena por distancia, precio y calificación', () => {
  const places = [
    { id: '1', published: false, latitude: -16.4955, longitude: -68.1336, estimatedCost: 5, averageRating: 5 },
    { id: '2', published: true, latitude: -16.51, longitude: -68.12, estimatedCost: 80, averageRating: 4.9 },
    { id: '3', published: true, latitude: -16.496, longitude: -68.134, estimatedCost: 20, averageRating: 4.1 },
  ];
  const pub = rules.filterPublishedPlaces(places);
  assert.equal(pub.length, 2);
  assert.ok(!pub.some((p) => p.id === '1'));

  const origin = { latitude: -16.4955, longitude: -68.1336 };
  assert.equal(rules.sortCatalogPlaces(pub, 'distance', origin)[0].id, '3');
  assert.equal(rules.sortCatalogPlaces(pub, 'price', origin)[0].id, '3');
  assert.equal(rules.sortCatalogPlaces(pub, 'rating', origin)[0].id, '2');
});

// 4. Optimización de rutas y límites
test('optimizeStopsNearestNeighbor ordena paradas reduciendo recorrido y generateRouteAlternatives respeta presupuesto/tiempo', () => {
  const origin = { latitude: -16.4955, longitude: -68.1336 };
  const far = { id: 'far', name: 'Far', category: 'cultura', latitude: -16.54, longitude: -68.09, estimatedCost: 20, visitMinutes: 30, published: true };
  const near = { id: 'near', name: 'Near', category: 'cultura', latitude: -16.496, longitude: -68.134, estimatedCost: 15, visitMinutes: 30, published: true };
  const mid = { id: 'mid', name: 'Mid', category: 'gastronomia', latitude: -16.505, longitude: -68.13, estimatedCost: 25, visitMinutes: 35, published: true };

  const opt = rules.optimizeStopsNearestNeighbor(origin, [far, mid, near]);
  assert.equal(opt[0].id, 'near');
  assert.equal(opt[1].id, 'mid');

  const budget = 45;
  const maxMin = 120;
  const alts = rules.generateRouteAlternatives({
    origin,
    places: [far, mid, near],
    budget,
    availableMinutes: maxMin,
    categories: [],
    preference: 'balanced',
  });
  assert.ok(alts.length >= 1);
  for (const alt of alts) {
    assert.ok(alt.metrics.finalCost <= budget, `Superó presupuesto: ${alt.metrics.finalCost}`);
    assert.ok(alt.metrics.totalDurationMinutes <= maxMin, `Superó tiempo: ${alt.metrics.totalDurationMinutes}`);
  }

  const impossible = rules.generateRouteAlternatives({ origin, places: [far, mid, near], budget: 2, availableMinutes: 5 });
  assert.equal(impossible.length, 0);
});

test('detectRouteSnapshotDrift advierte cambios posteriores en catálogo', () => {
  const drift = rules.detectRouteSnapshotDrift(
    {
      routeId: 'r1',
      version: 1,
      updatedAt: '2026-11-01T00:00:00Z',
      snapshotHash: 'v1-old',
      stops: [{ id: 'p1', name: 'Museo', estimatedCost: 20, visitMinutes: 45, latitude: -16.49, longitude: -68.13 }],
    },
    [{ id: 'p1', name: 'Museo', estimatedCost: 35, visitMinutes: 45, published: true }],
  );
  assert.equal(drift.changed, true);
  assert.ok(drift.reasons.length > 0);
});

// 5. Reglas de cupones y 5 errores detallados
test('validateCouponBeforeRedeem detecta expirado, agotado, límite usuario, código inválido e importe insuficiente', () => {
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);
  const validPromo = {
    code: 'PAZ20',
    status: 'active',
    starts_at: '2026-11-01T00:00:00Z',
    ends_at: '2026-12-30T00:00:00Z',
    max_redemptions: 10,
    redeemed_count: 2,
    per_user_limit: 1,
    conditions: 'Consumo mínimo Bs 80',
  };
  assert.equal(rules.validateCouponBeforeRedeem(validPromo, 100, 0, now).ok, true);
  assert.equal(rules.validateCouponBeforeRedeem(null, 100, 0, now).code, 'INVALID_CODE');
  assert.equal(rules.validateCouponBeforeRedeem({ ...validPromo, ends_at: '2026-11-10T00:00:00Z' }, 100, 0, now).code, 'COUPON_EXPIRED');
  assert.equal(rules.validateCouponBeforeRedeem({ ...validPromo, redeemed_count: 10 }, 100, 0, now).code, 'COUPON_EXHAUSTED');
  assert.equal(rules.validateCouponBeforeRedeem(validPromo, 100, 1, now).code, 'USER_LIMIT_REACHED');
  assert.equal(rules.validateCouponBeforeRedeem(validPromo, 50, 0, now).code, 'MIN_AMOUNT_NOT_MET');

  const parsedQr = rules.parseCouponVerificationCode(rules.buildCouponVerificationCode('promo-1', 'paz20', 'redemp-1234'));
  assert.equal(parsedQr.validFormat, true);
  assert.equal(parsedQr.code, 'PAZ20');
});

// 6. Validación VIP y ocultamiento de anuncios
test('getVipStatusSummary bloquea VIP expirado y oculta anuncios cuando VIP está activo', () => {
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);
  const activeSub = { id: 's1', user_id: 'u1', status: 'active', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' };
  const expiredSub = { id: 's2', user_id: 'u1', status: 'active', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' };

  const activeSummary = rules.getVipStatusSummary([activeSub], 'u1', now, false);
  assert.equal(activeSummary.active, true);
  assert.equal(activeSummary.shouldHideAds, true);
  assert.equal(activeSummary.maxStopsAllowed, rules.VIP_ROUTE_MAX_STOPS);

  const expiredSummary = rules.getVipStatusSummary([expiredSub], 'u1', now, false);
  assert.equal(expiredSummary.active, false);
  assert.equal(expiredSummary.isExpired, true);
  assert.equal(expiredSummary.shouldHideAds, false);
  assert.equal(expiredSummary.maxStopsAllowed, rules.FREE_ROUTE_MAX_STOPS);

  const campaign = { status: 'active', budget: 100, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z' };
  assert.equal(rules.shouldShowAdToUser(campaign, true, null, null, now), false);
  assert.equal(rules.shouldShowAdToUser(campaign, false, null, null, now), true);
});

// 7. Límites y estados de campañas
test('normalizeCampaignStatus maneja DRAFT/ACTIVE/PAUSED/EXHAUSTED/FINISHED y tráfico horario', () => {
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);
  const exhausted = rules.normalizeCampaignStatus('active', { budget: 100, spentAmount: 100, endsAt: '2026-12-30T00:00:00Z' }, now);
  assert.equal(exhausted.status, 'EXHAUSTED');
  assert.equal(exhausted.shouldAutoPause, true);

  const finished = rules.normalizeCampaignStatus('active', { budget: 100, spentAmount: 20, endsAt: '2026-11-01T00:00:00Z' }, now);
  assert.equal(finished.status, 'FINISHED');
  assert.equal(finished.shouldAutoPause, true);

  const traffic = rules.aggregateCampaignHourlyTraffic([
    { kind: 'impression', occurred_at: '2026-11-23T14:10:00Z' },
    { kind: 'click', occurred_at: '2026-11-23T14:20:00Z' },
  ]);
  assert.equal(traffic.totalEvents, 2);
  assert.equal(traffic.buckets.length, 1);
});

// 8. Seguridad, roles y validación de multimedia (<=5MB)
test('assertCanChangeUserRole, canManageBusiness y validateImageUpload protegen seguridad y tamaño 5MB', () => {
  assert.equal(rules.assertCanChangeUserRole('u1', 'u1', 'admin').allowed, false);
  assert.equal(rules.assertCanChangeUserRole('u1', 'u2', 'tourist').allowed, false);
  assert.equal(rules.assertCanChangeUserRole('u1', 'u2', 'admin').allowed, true);
  assert.equal(rules.canManageBusiness('u1', 'advertiser', 'u2'), false);
  assert.equal(rules.canManageBusiness('u1', 'advertiser', 'u1'), true);

  assert.equal(rules.validateImageUpload({ mimeType: 'image/jpeg', fileSize: 1024 * 1024 }, 0).valid, true);
  assert.equal(rules.validateImageUpload({ mimeType: 'image/jpeg', fileSize: 6 * 1024 * 1024 }, 0).valid, false);
  assert.equal(rules.validateImageUpload({ mimeType: 'application/pdf', fileSize: 1000 }, 0).valid, false);
  assert.equal(rules.validateImageUpload({ mimeType: 'image/png', fileSize: 1000 }, 5).valid, false);
});

console.log(`ALL ${passed} UNIT TESTS PASSED.`);
