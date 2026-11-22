import { listRecords, type CatalogRow } from '@/services/catalog';
import type { PlaceCategory } from '@/types';
import type { MapPoint } from './discovery';
import type { RouteCriteria } from './route-planner';

type BackendRouteRow = CatalogRow & {
  name?: unknown;
  budget?: unknown;
  available_minutes?: unknown;
  origin_lat?: unknown;
  origin_lng?: unknown;
  category_id?: unknown;
  visibility?: unknown;
};

type BackendStopRow = CatalogRow & {
  route_id?: unknown;
  place_id?: unknown;
  position?: unknown;
  visit_minutes?: unknown;
  estimated_cost?: unknown;
};

type BackendPlaceRow = CatalogRow & {
  name?: unknown;
  description?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  estimated_cost?: unknown;
  visit_minutes?: unknown;
  published?: unknown;
};

type PlaceCategoryRow = CatalogRow & {
  place_id?: unknown;
  category_id?: unknown;
};

type CategoryRow = CatalogRow & { name?: unknown; slug?: unknown };

export type BackendRoutePlace = {
  id: string;
  name: string;
  description: string;
  address: string;
  point: MapPoint | null;
  estimatedCost: number;
  visitMinutes: number;
  categories: PlaceCategory[];
};

export type BackendPlannedRoute = {
  id: string;
  name: string;
  placeIds: string[];
  categories: PlaceCategory[];
  cost: number;
  durationMin: number;
  distanceKm: number;
  visited: boolean;
  departure: string;
  origin: MapPoint;
  places: BackendRoutePlace[];
};

const numberValue = (value: unknown, fallback = 0) => {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const textValue = (value: unknown, fallback = '') => value == null ? fallback : String(value);

function categoryFrom(value: unknown): PlaceCategory | null {
  const normalized = textValue(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('gastr')) return 'gastronomia';
  if (normalized.includes('cult')) return 'cultura';
  if (normalized.includes('natur') || normalized.includes('parque') || normalized.includes('mirador')) return 'naturaleza';
  return null;
}

function pointFrom(row: { latitude?: unknown; longitude?: unknown }): MapPoint | null {
  const latitude = numberValue(row.latitude, Number.NaN);
  const longitude = numberValue(row.longitude, Number.NaN);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function distanceKm(a: MapPoint, b: MapPoint) {
  const radians = Math.PI / 180;
  const latitudeA = a.latitude * radians;
  const latitudeB = b.latitude * radians;
  const deltaLatitude = (b.latitude - a.latitude) * radians;
  const deltaLongitude = (b.longitude - a.longitude) * radians;
  const h = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

async function fetchRows(signal?: AbortSignal) {
  const [routes, stops, places, links, categories] = await Promise.all([
    listRecords<BackendRouteRow>('routes', { signal }),
    listRecords<BackendStopRow>('route-stops', { signal }),
    listRecords<BackendPlaceRow>('places', { signal }),
    listRecords<PlaceCategoryRow>('place-categories', { signal }),
    listRecords<CategoryRow>('categories', { signal }),
  ]);
  return { routes, stops, places, links, categories };
}

function buildRoutes(data: Awaited<ReturnType<typeof fetchRows>>): BackendPlannedRoute[] {
  const categoryById = new Map(data.categories.map((item) => [item.id, categoryFrom(item.slug ?? item.name)]));
  const categoriesByPlace = new Map<string, PlaceCategory[]>();
  for (const link of data.links) {
    const placeId = textValue(link.place_id);
    const category = categoryById.get(textValue(link.category_id)) ?? categoryFrom(link.category_id);
    if (!placeId || !category) continue;
    const current = categoriesByPlace.get(placeId) ?? [];
    if (!current.includes(category)) current.push(category);
    categoriesByPlace.set(placeId, current);
  }

  const placesById = new Map(data.places.filter((row) => row.published !== false).map((row) => {
    const categories = categoriesByPlace.get(row.id) ?? [];
    return [row.id, {
      id: row.id,
      name: textValue(row.name, 'Lugar sin nombre'),
      description: textValue(row.description),
      address: textValue(row.address, 'Ubicación por confirmar'),
      point: pointFrom(row),
      estimatedCost: numberValue(row.estimated_cost),
      visitMinutes: Math.max(1, numberValue(row.visit_minutes, 30)),
      categories,
    } satisfies BackendRoutePlace];
  }));
  const stopsByRoute = new Map<string, BackendStopRow[]>();
  for (const stop of data.stops) {
    const routeId = textValue(stop.route_id);
    const current = stopsByRoute.get(routeId) ?? [];
    current.push(stop);
    stopsByRoute.set(routeId, current);
  }

  return data.routes.filter((route) => route.visibility === undefined || route.visibility === 'public').map((route) => {
    const origin = pointFrom({ latitude: route.origin_lat, longitude: route.origin_lng })
      ?? { latitude: -16.4955, longitude: -68.1336 };
    const placesInRoute = (stopsByRoute.get(route.id) ?? [])
      .slice()
      .sort((a, b) => numberValue(a.position) - numberValue(b.position))
      .map((stop) => placesById.get(textValue(stop.place_id)))
      .filter((place): place is BackendRoutePlace => Boolean(place));
    const categories = [...new Set(placesInRoute.flatMap((place) => place.categories))];
    let distance = 0;
    let previous = origin;
    for (const place of placesInRoute) {
      if (place.point) {
        distance += distanceKm(previous, place.point);
        previous = place.point;
      }
    }
    const visitMinutes = placesInRoute.reduce((sum, place) => sum + place.visitMinutes, 0);
    return {
      id: route.id,
      name: textValue(route.name, 'Ruta sin nombre'),
      placeIds: placesInRoute.map((place) => place.id),
      categories,
      cost: numberValue(route.budget),
      durationMin: Math.max(numberValue(route.available_minutes), visitMinutes),
      distanceKm: Math.round(distance * 1.4 * 10) / 10,
      visited: false,
      departure: 'Origen de la ruta',
      origin,
      places: placesInRoute,
    };
  }).filter((route) => route.placeIds.length > 0);
}

export async function loadBackendRoutes(criteria: RouteCriteria, signal?: AbortSignal) {
  const routes = buildRoutes(await fetchRows(signal));
  return routes
    .filter((route) => criteria.categories.every((category) => route.categories.includes(category)))
    .filter((route) => route.cost <= criteria.budget && route.durationMin <= criteria.minutes)
    .filter((route) => criteria.maxDistance == null || route.distanceKm <= criteria.maxDistance)
    .map((route) => ({ ...route, departure: criteria.departure, origin: criteria.origin }))
    .sort((a, b) => criteria.order === 'cost'
      ? a.cost - b.cost
      : criteria.order === 'distance' ? a.distanceKm - b.distanceKm : a.durationMin - b.durationMin);
}

export async function loadBackendRoute(id: string, signal?: AbortSignal) {
  return buildRoutes(await fetchRows(signal)).find((route) => route.id === id) ?? null;
}
