export type VipSubscriptionRecord = {
  id: string;
  user_id: string;
  plan_id?: string | null;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
};

export type VipStatusSummary = {
  active: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  daysRemaining: number;
  shouldHideAds: boolean;
  maxStopsAllowed: number;
  activeSubscriptionId: string | null;
};

export const FREE_ROUTE_MAX_STOPS = 4;
export const VIP_ROUTE_MAX_STOPS = 12;

export function isVipSubscriptionActive(sub: VipSubscriptionRecord | null | undefined, nowMs = Date.now()): boolean {
  if (!sub) return false;
  if (String(sub.status || '').toLowerCase() !== 'active') return false;
  const start = sub.starts_at ? Date.parse(sub.starts_at) : 0;
  const end = sub.ends_at ? Date.parse(sub.ends_at) : 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= 0) return false;
  return start <= nowMs && end > nowMs;
}

export function getVipStatusSummary(
  subscriptions: VipSubscriptionRecord[],
  userId: string | null | undefined,
  nowMs = Date.now(),
  demoVip = false,
): VipStatusSummary {
  if (demoVip) {
    const expiresAt = new Date(nowMs + 30 * 86400000).toISOString();
    return {
      active: true,
      isExpired: false,
      expiresAt,
      daysRemaining: 30,
      shouldHideAds: true,
      maxStopsAllowed: VIP_ROUTE_MAX_STOPS,
      activeSubscriptionId: 'demo-vip-sub',
    };
  }
  const own = subscriptions.filter((sub) => !userId || sub.user_id === userId);
  const activeSub = own.find((sub) => isVipSubscriptionActive(sub, nowMs));
  if (activeSub && activeSub.ends_at) {
    const endMs = Date.parse(activeSub.ends_at);
    const daysRemaining = Math.max(1, Math.ceil((endMs - nowMs) / 86400000));
    return {
      active: true,
      isExpired: false,
      expiresAt: activeSub.ends_at,
      daysRemaining,
      shouldHideAds: true,
      maxStopsAllowed: VIP_ROUTE_MAX_STOPS,
      activeSubscriptionId: activeSub.id,
    };
  }
  const latestEnded = own
    .filter((sub) => sub.ends_at && Number.isFinite(Date.parse(sub.ends_at)))
    .sort((a, b) => Date.parse(String(b.ends_at)) - Date.parse(String(a.ends_at)))[0];
  return {
    active: false,
    isExpired: Boolean(latestEnded),
    expiresAt: latestEnded?.ends_at || null,
    daysRemaining: 0,
    shouldHideAds: false,
    maxStopsAllowed: FREE_ROUTE_MAX_STOPS,
    activeSubscriptionId: null,
  };
}

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function estimateTravelMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0.02) return 0;
  // Walking up to 2.5 km (~4.5 km/h); urban transit above 2.5 km (~20 km/h) + 4 min boarding buffer.
  if (distanceKm <= 2.5) return Math.max(3, Math.round((distanceKm / 4.5) * 60));
  return Math.max(12, Math.round((distanceKm / 20) * 60) + 4);
}

export function filterPublishedPlaces<T extends { published?: boolean | null }>(places: T[]): T[] {
  return places.filter((place) => place.published !== false);
}

export type CatalogSortOption = 'distance' | 'price' | 'rating' | 'recommended';

export type SortableCatalogPlace = {
  id: string;
  latitude: number;
  longitude: number;
  estimatedCost: number;
  averageRating?: number;
  reviewCount?: number;
  published?: boolean;
};

export function sortCatalogPlaces<T extends SortableCatalogPlace>(
  places: T[],
  sortBy: CatalogSortOption,
  origin: GeoPoint,
): T[] {
  const list = [...places];
  if (sortBy === 'distance') {
    return list.sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b));
  }
  if (sortBy === 'price') {
    return list.sort((a, b) => a.estimatedCost - b.estimatedCost);
  }
  if (sortBy === 'rating') {
    return list.sort((a, b) => {
      const diff = (b.averageRating ?? 0) - (a.averageRating ?? 0);
      if (Math.abs(diff) > 0.01) return diff;
      return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    });
  }
  return list;
}

export type PlannerPlaceInput = {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  latitude: number;
  longitude: number;
  estimatedCost: number;
  visitMinutes: number;
  averageRating?: number;
  published?: boolean;
  zoneId?: string | null;
};

export type RoutePreference = 'less_walking' | 'lower_cost' | 'top_rated' | 'balanced';

export type ComputedStop<T extends PlannerPlaceInput = PlannerPlaceInput> = {
  place: T;
  position: number;
  distanceFromPrevKm: number;
  travelMeters: number;
  travelMinutes: number;
  visitMinutes: number;
  estimatedCost: number;
  cumulativeMinutes: number;
  arrivalIso: string;
};

export type RouteCalculationResult<T extends PlannerPlaceInput = PlannerPlaceInput> = {
  stops: ComputedStop<T>[];
  totalDistanceKm: number;
  totalTravelMinutes: number;
  totalVisitMinutes: number;
  totalDurationMinutes: number;
  rawCost: number;
  discountAmount: number;
  finalCost: number;
  snapshotHash: string;
};

export function computeSnapshotHash(items: { id: string; cost: number; visitMinutes: number }[]): string {
  const payload = items.map((item) => `${item.id}:${item.cost}:${item.visitMinutes}`).join('|');
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16)}`;
}

export function calculateRouteMetrics<T extends PlannerPlaceInput>(
  origin: GeoPoint,
  orderedPlaces: T[],
  discountPercent = 0,
  startAtMs = Date.UTC(2026, 0, 1, 9, 0, 0),
): RouteCalculationResult<T> {
  let prevPoint: GeoPoint = origin;
  let totalDistanceKm = 0;
  let totalTravelMinutes = 0;
  let totalVisitMinutes = 0;
  let rawCost = 0;
  let elapsedMinutes = 0;

  const stops: ComputedStop<T>[] = orderedPlaces.map((place, index) => {
    const distanceFromPrevKm = haversineKm(prevPoint, { latitude: place.latitude, longitude: place.longitude });
    const travelMeters = Math.round(distanceFromPrevKm * 1000);
    const travelMinutes = estimateTravelMinutes(distanceFromPrevKm);
    const visitMinutes = Math.max(15, Math.round(place.visitMinutes || 45));
    const estimatedCost = Math.max(0, Math.round((place.estimatedCost || 0) * 100) / 100);

    elapsedMinutes += travelMinutes;
    const arrivalIso = new Date(startAtMs + elapsedMinutes * 60000).toISOString();
    elapsedMinutes += visitMinutes;

    totalDistanceKm += distanceFromPrevKm;
    totalTravelMinutes += travelMinutes;
    totalVisitMinutes += visitMinutes;
    rawCost += estimatedCost;
    prevPoint = { latitude: place.latitude, longitude: place.longitude };

    return {
      place,
      position: index + 1,
      distanceFromPrevKm: Math.round(distanceFromPrevKm * 100) / 100,
      travelMeters,
      travelMinutes,
      visitMinutes,
      estimatedCost,
      cumulativeMinutes: elapsedMinutes,
      arrivalIso,
    };
  });

  const safeDiscount = Number.isFinite(discountPercent) ? Math.min(100, Math.max(0, discountPercent)) : 0;
  const discountAmount = Math.round(rawCost * (safeDiscount / 100) * 100) / 100;
  const finalCost = Math.max(0, Math.round((rawCost - discountAmount) * 100) / 100);

  return {
    stops,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalTravelMinutes,
    totalVisitMinutes,
    totalDurationMinutes: totalTravelMinutes + totalVisitMinutes,
    rawCost: Math.round(rawCost * 100) / 100,
    discountAmount,
    finalCost,
    snapshotHash: computeSnapshotHash(
      stops.map((stop) => ({
        id: stop.place.id,
        cost: stop.estimatedCost,
        visitMinutes: stop.visitMinutes,
      })),
    ),
  };
}

export function optimizeStopsNearestNeighbor<T extends PlannerPlaceInput>(origin: GeoPoint, stops: T[]): T[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const ordered: T[] = [];
  let cursor: GeoPoint = origin;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(cursor, remaining[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    ordered.push(picked);
    cursor = { latitude: picked.latitude, longitude: picked.longitude };
  }
  return ordered;
}

export type GeneratedRouteAlternative<T extends PlannerPlaceInput = PlannerPlaceInput> = {
  key: string;
  title: string;
  preference: RoutePreference;
  summary: string;
  metrics: RouteCalculationResult<T>;
};

export function generateRouteAlternatives<T extends PlannerPlaceInput>(params: {
  origin: GeoPoint;
  places: T[];
  budget: number;
  availableMinutes: number;
  categories?: string[];
  preference?: RoutePreference;
  maxStops?: number;
}): GeneratedRouteAlternative<T>[] {
  const {
    origin,
    places,
    budget,
    availableMinutes,
    categories = [],
    preference = 'balanced',
    maxStops = FREE_ROUTE_MAX_STOPS,
  } = params;

  const published = filterPublishedPlaces(places);
  const categoryFiltered = categories.length > 0
    ? published.filter(
        (p) => categories.includes(p.category) || (p.tags || []).some((tag) => categories.includes(tag)),
      )
    : published;

  const pool = categoryFiltered.length > 0 ? categoryFiltered : published;

  function buildForMode(mode: RoutePreference, title: string, key: string): GeneratedRouteAlternative<T> | null {
    const scored = [...pool].sort((a, b) => {
      const da = haversineKm(origin, a);
      const db = haversineKm(origin, b);
      if (mode === 'lower_cost') {
        if (a.estimatedCost !== b.estimatedCost) return a.estimatedCost - b.estimatedCost;
        return da - db;
      }
      if (mode === 'less_walking') {
        return da - db;
      }
      if (mode === 'top_rated') {
        const ra = a.averageRating ?? 4;
        const rb = b.averageRating ?? 4;
        if (rb !== ra) return rb - ra;
        return da - db;
      }
      // balanced score
      const scoreA = (a.averageRating ?? 4) * 2 - da * 0.8 - a.estimatedCost * 0.03;
      const scoreB = (b.averageRating ?? 4) * 2 - db * 0.8 - b.estimatedCost * 0.03;
      return scoreB - scoreA;
    });

    const chosen: T[] = [];
    let currentCursor = origin;
    let spentCost = 0;
    let spentMinutes = 0;

    for (const candidate of scored) {
      if (chosen.length >= maxStops) break;
      const distKm = haversineKm(currentCursor, candidate);
      const legMin = estimateTravelMinutes(distKm) + Math.max(15, candidate.visitMinutes || 45);
      const nextCost = spentCost + (candidate.estimatedCost || 0);
      const nextMinutes = spentMinutes + legMin;
      if (nextCost <= budget && nextMinutes <= availableMinutes) {
        chosen.push(candidate);
        spentCost = nextCost;
        spentMinutes = nextMinutes;
        currentCursor = { latitude: candidate.latitude, longitude: candidate.longitude };
      }
    }

    if (chosen.length === 0) return null;
    const optimized = optimizeStopsNearestNeighbor(origin, chosen);
    let metrics = calculateRouteMetrics(origin, optimized);
    // Strict guard after TSP reorder: trim tail stops if total distance slightly changed travel time above limit.
    const safeList = [...optimized];
    while (safeList.length > 0 && (metrics.finalCost > budget || metrics.totalDurationMinutes > availableMinutes)) {
      safeList.pop();
      metrics = calculateRouteMetrics(origin, safeList);
    }
    if (safeList.length === 0) return null;

    return {
      key,
      title,
      preference: mode,
      summary: `${safeList.length} paradas · ${metrics.totalDurationMinutes} min · ${metrics.finalCost.toFixed(0)} Bs`,
      metrics,
    };
  }

  const strategies: [RoutePreference, string, string][] = [
    [preference, preference === 'less_walking' ? 'Menor caminata' : preference === 'lower_cost' ? 'Más económica' : preference === 'top_rated' ? 'Mejor valorada' : 'Ruta equilibrada', 'alt-primary'],
    ['less_walking', 'Alternativa caminata corta', 'alt-walk'],
    ['lower_cost', 'Alternativa económico', 'alt-cost'],
    ['top_rated', 'Alternativa imperdibles', 'alt-rated'],
  ];

  const results: GeneratedRouteAlternative<T>[] = [];
  const seenSignatures = new Set<string>();
  for (const [mode, title, key] of strategies) {
    const built = buildForMode(mode, title, key);
    if (!built) continue;
    const sig = built.metrics.stops.map((s) => s.place.id).join(',');
    if (seenSignatures.has(sig) && results.length > 0) continue;
    seenSignatures.add(sig);
    results.push(built);
    if (results.length >= 3) break;
  }

  return results;
}

export type RouteSnapshot = {
  routeId: string;
  shareSlug?: string | null;
  version: number;
  updatedAt: string;
  snapshotHash: string;
  stops: {
    id: string;
    name: string;
    address?: string;
    estimatedCost: number;
    visitMinutes: number;
    latitude: number;
    longitude: number;
  }[];
};

export function detectRouteSnapshotDrift(
  snapshot: RouteSnapshot | null | undefined,
  livePlaces: { id: string; name: string; estimatedCost: number; visitMinutes: number; published?: boolean }[],
): { changed: boolean; reasons: string[]; missingPlaceIds: string[] } {
  if (!snapshot) return { changed: false, reasons: [], missingPlaceIds: [] };
  const byId = new Map(livePlaces.map((p) => [p.id, p]));
  const reasons: string[] = [];
  const missingPlaceIds: string[] = [];

  for (const stop of snapshot.stops) {
    const live = byId.get(stop.id);
    if (!live) {
      missingPlaceIds.push(stop.id);
      reasons.push(`"${stop.name}" ya no está en el catálogo activo (se conserva en tu snapshot).`);
      continue;
    }
    if (live.published === false) {
      reasons.push(`"${stop.name}" pasó a estado no publicado.`);
    }
    if (Math.round(live.estimatedCost) !== Math.round(stop.estimatedCost)) {
      reasons.push(`"${stop.name}" cambió costo de ${stop.estimatedCost} Bs a ${live.estimatedCost} Bs.`);
    }
    if (Math.round(live.visitMinutes) !== Math.round(stop.visitMinutes)) {
      reasons.push(`"${stop.name}" cambió duración estimada a ${live.visitMinutes} min.`);
    }
  }

  return { changed: reasons.length > 0, reasons, missingPlaceIds };
}

export const MAX_REVIEW_PHOTOS = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function validateImageUpload(
  asset: { mimeType?: string | null; fileSize?: number | null; fileName?: string | null },
  currentCount: number,
  maxCount = MAX_REVIEW_PHOTOS,
): { valid: boolean; reason?: string } {
  if (currentCount >= maxCount) {
    return { valid: false, reason: `Puedes adjuntar como máximo ${maxCount} fotografías.` };
  }
  const mime = (asset.mimeType || '').toLowerCase();
  const extMatch = /\.(jpe?g|png|webp)$/i.test(asset.fileName || '');
  if (mime && !ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
    return { valid: false, reason: 'Formato no permitido. Usa únicamente JPG, PNG o WEBP.' };
  }
  if (!mime && asset.fileName && !extMatch) {
    return { valid: false, reason: 'Extensión de imagen inválida. Usa JPG, PNG o WEBP.' };
  }
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_IMAGE_BYTES) {
    const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
    return { valid: false, reason: `La imagen pesa ${mb} MB. Máx. 5 MB por foto.` };
  }
  return { valid: true };
}

export type CouponErrorCode =
  | 'COUPON_EXPIRED'
  | 'COUPON_EXHAUSTED'
  | 'USER_LIMIT_REACHED'
  | 'INVALID_CODE'
  | 'MIN_AMOUNT_NOT_MET';

export type CouponRuleCheckResult =
  | { ok: true }
  | { ok: false; code: CouponErrorCode; reason: string; severity: 'warning' | 'error' };

export function parseMinPurchaseFromConditions(conditions?: string | null): number {
  if (!conditions) return 0;
  const match = conditions.match(/(\d+(?:[.,]\d+)?)\s*(?:bs|bob|\$)?/i);
  if (!match) return 0;
  const val = Number(match[1].replace(',', '.'));
  return Number.isFinite(val) && /mínim|minim|compra|consumo/i.test(conditions) ? val : 0;
}

export function validateCouponBeforeRedeem(
  promo: {
    code?: string | null;
    status?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    max_redemptions?: number | null;
    redeemed_count?: number | null;
    per_user_limit?: number | null;
    conditions?: string | null;
  } | null,
  purchaseAmount: number,
  userRedemptionsCount = 0,
  nowMs = Date.now(),
): CouponRuleCheckResult {
  if (!promo || !String(promo.code || '').trim()) {
    return { ok: false, code: 'INVALID_CODE', reason: 'Código inválido o promoción no encontrada.', severity: 'error' };
  }
  const status = String(promo.status || '').toLowerCase();
  if (status === 'inactive' || status === 'cancelled') {
    return { ok: false, code: 'INVALID_CODE', reason: 'Este código promocional no está activo ni es válido para canje.', severity: 'error' };
  }
  if (status === 'expired' || (promo.ends_at && Date.parse(promo.ends_at) < nowMs)) {
    return { ok: false, code: 'COUPON_EXPIRED', reason: 'Cupón expirado: la fecha de vigencia ya concluyó.', severity: 'warning' };
  }
  if (promo.starts_at && Date.parse(promo.starts_at) > nowMs) {
    return { ok: false, code: 'COUPON_EXPIRED', reason: 'Cupón aún fuera de vigencia: todavía no inicia su periodo válido.', severity: 'warning' };
  }
  if (
    status === 'exhausted'
    || (promo.max_redemptions != null && promo.redeemed_count != null && promo.redeemed_count >= promo.max_redemptions)
  ) {
    return { ok: false, code: 'COUPON_EXHAUSTED', reason: 'Cupón agotado: alcanzó el límite total de canjes.', severity: 'warning' };
  }
  if (promo.per_user_limit != null && userRedemptionsCount >= promo.per_user_limit) {
    return { ok: false, code: 'USER_LIMIT_REACHED', reason: 'Límite por usuario alcanzado: ya utilizaste el máximo permitido de este cupón.', severity: 'warning' };
  }
  const minPurchase = parseMinPurchaseFromConditions(promo.conditions);
  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0 || purchaseAmount < minPurchase) {
    return {
      ok: false,
      code: 'MIN_AMOUNT_NOT_MET',
      reason: minPurchase > 0
        ? `Importe de compra insuficiente: el consumo mínimo requerido es ${minPurchase} Bs.`
        : 'Importe de compra insuficiente: ingresa un monto mayor a 0 Bs.',
      severity: 'error',
    };
  }
  return { ok: true };
}

export function classifyCouponApiError(message: string): { code: CouponErrorCode; reason: string; severity: 'warning' | 'error' } {
  const lower = (message || '').toLowerCase();
  if (/expir|vencid|vigencia|fecha/.test(lower)) {
    return { code: 'COUPON_EXPIRED', reason: 'Cupón expirado según validación del servidor.', severity: 'warning' };
  }
  if (/agotad|stock|cupo|total/.test(lower)) {
    return { code: 'COUPON_EXHAUSTED', reason: 'Cupón agotado: límite global de canjes alcanzado.', severity: 'warning' };
  }
  if (/límite por usuario|limite por usuario|per_user|ya canje|duplicad/.test(lower)) {
    return { code: 'USER_LIMIT_REACHED', reason: 'Límite por usuario alcanzado para esta promoción.', severity: 'warning' };
  }
  if (/importe|monto|mínim|minim|insuficiente|purchase/.test(lower)) {
    return { code: 'MIN_AMOUNT_NOT_MET', reason: 'Importe de compra insuficiente para aplicar el descuento.', severity: 'error' };
  }
  return { code: 'INVALID_CODE', reason: message || 'Código inválido o promoción no disponible para canje.', severity: 'error' };
}

export function buildCouponVerificationCode(promotionId: string, code: string, redemptionId?: string): string {
  const shortRef = (redemptionId || promotionId).slice(0, 8).toUpperCase();
  return `TYA-VOUCHER|${code.toUpperCase()}|${shortRef}`;
}

export function parseCouponVerificationCode(rawInput: string): { validFormat: boolean; code: string; ref: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) return { validFormat: false, code: '', ref: '' };
  if (trimmed.startsWith('TYA-VOUCHER|')) {
    const [, code = '', ref = ''] = trimmed.split('|');
    return { validFormat: Boolean(code), code: code.toUpperCase(), ref };
  }
  return { validFormat: trimmed.length >= 3, code: trimmed.toUpperCase(), ref: '' };
}

export type StructuredNotificationMeta = {
  promotion_id: string | null;
  redemption_id: string | null;
  error_code: CouponErrorCode | string | null;
  error_reason: string | null;
  severity: 'info' | 'warning' | 'error';
};

export function buildCouponNotificationMetadata(meta: Partial<StructuredNotificationMeta>): StructuredNotificationMeta {
  return {
    promotion_id: meta.promotion_id || null,
    redemption_id: meta.redemption_id || null,
    error_code: meta.error_code || null,
    error_reason: meta.error_reason || null,
    severity: meta.severity || 'info',
  };
}

export type CampaignLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXHAUSTED' | 'FINISHED';

export function normalizeCampaignStatus(
  rawStatus: string | null | undefined,
  opts: { budget: number; spentAmount?: number; startsAt?: string | null; endsAt?: string | null },
  nowMs = Date.now(),
): { status: CampaignLifecycleStatus; remainingBudget: number; shouldAutoPause: boolean } {
  const upper = String(rawStatus || 'DRAFT').toUpperCase() as CampaignLifecycleStatus;
  const budget = Math.max(0, Number(opts.budget || 0));
  const spent = Math.max(0, Number(opts.spentAmount || 0));
  const remainingBudget = Math.max(0, Math.round((budget - spent) * 100) / 100);
  const endMs = opts.endsAt ? Date.parse(opts.endsAt) : Infinity;

  if (Number.isFinite(endMs) && endMs < nowMs) {
    return { status: 'FINISHED', remainingBudget, shouldAutoPause: upper === 'ACTIVE' };
  }
  if (budget > 0 && spent >= budget) {
    return { status: 'EXHAUSTED', remainingBudget: 0, shouldAutoPause: upper === 'ACTIVE' };
  }
  if (upper === 'DRAFT' || upper === 'ACTIVE' || upper === 'PAUSED' || upper === 'EXHAUSTED' || upper === 'FINISHED') {
    return { status: upper, remainingBudget, shouldAutoPause: false };
  }
  return { status: 'DRAFT', remainingBudget, shouldAutoPause: false };
}

export function shouldShowAdToUser(
  campaign: {
    status?: string | null;
    budget?: number | null;
    spentAmount?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    zone_id?: string | null;
    category_id?: string | null;
    radius_meters?: number | null;
  },
  isVipActive: boolean,
  userCoord?: GeoPoint | null,
  campaignOrigin?: GeoPoint | null,
  nowMs = Date.now(),
): boolean {
  if (isVipActive) return false;
  const lifecycle = normalizeCampaignStatus(
    campaign.status,
    {
      budget: Number(campaign.budget || 0),
      spentAmount: Number(campaign.spentAmount || 0),
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
    },
    nowMs,
  );
  if (lifecycle.status !== 'ACTIVE') return false;
  if (campaign.starts_at && Date.parse(campaign.starts_at) > nowMs) return false;
  if (userCoord && campaignOrigin && campaign.radius_meters && campaign.radius_meters > 0) {
    const distKm = haversineKm(userCoord, campaignOrigin);
    if (distKm * 1000 > campaign.radius_meters) return false;
  }
  return true;
}

export type HourlyTrafficBucket = {
  hourLabel: string;
  impressions: number;
  clicks: number;
  conversions: number;
};

export function aggregateCampaignHourlyTraffic(
  events: { kind?: string | null; occurred_at?: string | null; created_at?: string | null }[],
): { buckets: HourlyTrafficBucket[]; peakHourLabel: string; totalEvents: number } {
  const byHour = new Map<number, { impressions: number; clicks: number; conversions: number }>();
  for (const event of events) {
    const rawDate = event.occurred_at || event.created_at;
    const ms = rawDate ? Date.parse(rawDate) : NaN;
    if (!Number.isFinite(ms)) continue;
    const hour = new Date(ms).getHours();
    const cur = byHour.get(hour) || { impressions: 0, clicks: 0, conversions: 0 };
    const kind = String(event.kind || '').toLowerCase();
    if (kind === 'click' || kind === 'open') cur.clicks += 1;
    else if (kind === 'conversion' || kind === 'route' || kind === 'visit') cur.conversions += 1;
    else cur.impressions += 1;
    byHour.set(hour, cur);
  }
  const buckets = Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, counts]) => ({
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      ...counts,
    }));

  const peak = buckets.reduce<HourlyTrafficBucket | null>(
    (best, item) => {
      const score = item.impressions + item.clicks * 2 + item.conversions * 3;
      const bestScore = best ? best.impressions + best.clicks * 2 + best.conversions * 3 : -1;
      return score > bestScore ? item : best;
    },
    null,
  );

  return {
    buckets,
    peakHourLabel: peak?.hourLabel || 'Sin tráfico aún',
    totalEvents: events.length,
  };
}

export const TICKET_PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
export const TICKET_STATUS_OPTIONS = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'] as const;
export const TICKET_KIND_OPTIONS = [
  'general',
  'place_report',
  'review_report',
  'coupon_dispute',
  'business_verification',
  'account_issue',
] as const;

export function assertCanChangeUserRole(
  actorUserId: string | null | undefined,
  targetUserId: string | null | undefined,
  actorRole: string | null | undefined,
): { allowed: boolean; reason?: string } {
  if (actorRole !== 'admin') {
    return { allowed: false, reason: 'Solo un administrador puede modificar roles o suspender cuentas.' };
  }
  if (!actorUserId || !targetUserId || actorUserId === targetUserId) {
    return { allowed: false, reason: 'Por seguridad, un usuario no puede cambiar su propio rol.' };
  }
  return { allowed: true };
}

export function canManageBusiness(
  actorUserId: string | null | undefined,
  actorRole: string | null | undefined,
  businessOwnerId: string | null | undefined,
): boolean {
  if (actorRole === 'admin') return true;
  if (!actorUserId || !businessOwnerId) return false;
  return actorUserId === businessOwnerId;
}
