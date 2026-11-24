import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { SponsoredCampaignBanner } from '@/components/ads/sponsored-banner';
import { Screen } from '@/components/layout/screen';
import { PlacePhoto } from '@/components/place-photo';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { useSelectedLocation } from '@/features/turista/location-context';
import { categoryLabels } from '@/features/turista/data/route-planner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import {
  type CatalogSortOption,
  filterPublishedPlaces,
  haversineKm,
  sortCatalogPlaces,
} from '@/services/domain-rules';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { spacing } from '@/theme';
import type { PlaceCategory } from '@/types';

const text = (value: unknown) => (value == null ? '' : String(value));

function mapUrl(place: CatalogRow) {
  if (place.latitude == null || place.longitude == null) return null;
  const lat = Number(place.latitude);
  const lng = Number(place.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;
}

function normalizeCategorySlug(raw: unknown): PlaceCategory {
  const s = text(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('gastr')) return 'gastronomia';
  if (s.includes('natur') || s.includes('parque') || s.includes('mirador')) return 'naturaleza';
  return 'cultura';
}

export default function CatalogScreen() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const demoPlaces = useDemoStore((s) => s.places);
  const demoRoutes = useDemoStore((s) => s.routes);
  const toggleDemoSavedRoute = useDemoStore((s) => s.toggleSavedRoute);
  const addDemoVisit = useDemoStore((s) => s.addVisit);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const showToast = useUiStore((s) => s.showToast);
  const { location } = useSelectedLocation();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'places' | 'routes'>('places');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PlaceCategory>('all');
  const [sortBy, setSortBy] = useState<CatalogSortOption>('distance');
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const originPoint = useMemo(
    () => ({
      latitude: location.latitude ?? -16.4955,
      longitude: location.longitude ?? -68.1336,
    }),
    [location.latitude, location.longitude],
  );

  const load = useCallback(async (signal: AbortSignal) => {
    const [places, routes, reviews, categories, placeCategories, hours] = await Promise.all([
      listRecords('places', { signal }),
      listRecords('routes', { signal, private: Boolean(session) }),
      listRecords('reviews', { signal }).catch(() => []),
      listRecords('categories', { signal }).catch(() => []),
      listRecords('place-categories', { signal }).catch(() => []),
      listRecords('opening-hours', { signal }).catch(() => []),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, normalizeCategorySlug(c.slug || c.name)]));
    const primaryCatByPlace = new Map<string, PlaceCategory>();
    for (const link of placeCategories) {
      const pid = text(link.place_id);
      if (!pid || primaryCatByPlace.has(pid)) continue;
      const slug = catMap.get(text(link.category_id));
      if (slug) primaryCatByPlace.set(pid, slug);
    }

    const reviewAgg = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      if (r.hidden) continue;
      const pid = text(r.place_id);
      const rating = Number(r.rating);
      if (!pid || !Number.isFinite(rating)) continue;
      const prev = reviewAgg.get(pid) || { sum: 0, count: 0 };
      prev.sum += rating;
      prev.count += 1;
      reviewAgg.set(pid, prev);
    }

    const hoursByPlace = new Map<string, number>();
    for (const h of hours) {
      const pid = text(h.place_id);
      if (pid) hoursByPlace.set(pid, (hoursByPlace.get(pid) || 0) + 1);
    }

    // Guardia estricta Fase 2: ningún lugar con published === false aparece en el catálogo público.
    const combinedPlaces = isDemo ? [...demoPlaces, ...places] : places;
    const seenIds = new Set<string>();
    const dedupPlaces = combinedPlaces.filter((row) => {
      if (seenIds.has(row.id)) return false;
      seenIds.add(row.id);
      return true;
    });
    const publishedPlaces = filterPublishedPlaces(
      dedupPlaces.map((row): CatalogRow & { published: boolean } => ({ ...row, published: row.published !== false })),
    );

    return {
      places: publishedPlaces.map((row) => {
        const agg = reviewAgg.get(row.id);
        const avg = agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : 0;
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        const primaryCategory: PlaceCategory = primaryCatByPlace.get(row.id) || 'cultura';
        const tags: string[] = Array.isArray(row.services) ? row.services.map(String) : [];
        return {
          raw: row,
          id: row.id,
          name: text(row.name),
          description: text(row.description || row.address),
          address: text(row.address || 'Ubicación registrada'),
          latitude: Number.isFinite(lat) ? lat : originPoint.latitude,
          longitude: Number.isFinite(lng) ? lng : originPoint.longitude,
          estimatedCost: Number(row.estimated_cost ?? 0),
          visitMinutes: Number(row.visit_minutes ?? 45),
          averageRating: avg,
          reviewCount: agg?.count ?? 0,
          primaryCategory,
          tags,
          hoursCount: hoursByPlace.get(row.id) || 0,
          published: row.published !== false,
        };
      }),
      routes: [
        ...(isDemo ? demoRoutes.map((r) => ({ id: r.id, name: r.name, budget: r.cost, available_minutes: r.durationMin, visibility: r.visibility, user_id: r.userId }) as CatalogRow) : []),
        ...routes.filter((row) => row.visibility === 'public' || row.user_id === session?.user.id),
      ],
    };
  }, [session, isDemo, demoPlaces, demoRoutes, originPoint.latitude, originPoint.longitude]);

  const { data, loading, error, retry } = useRemoteData(load);

  const loadStops = useCallback(
    (signal: AbortSignal) =>
      selected ? listRecords('route-stops', { signal, filters: { route_id: selected } }) : Promise.resolve([]),
    [selected],
  );
  const stops = useRemoteData(loadStops);

  const filteredPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.places || []).filter((place) => {
      if (categoryFilter !== 'all' && place.primaryCategory !== categoryFilter) return false;
      if (!q) return true;
      return `${place.name} ${place.description} ${place.tags.join(' ')}`.toLowerCase().includes(q);
    });
    return sortCatalogPlaces(list, sortBy, originPoint);
  }, [data?.places, categoryFilter, query, sortBy, originPoint]);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.routes || []).filter((row) => text(row.name).toLowerCase().includes(q));
  }, [data?.routes, query]);

  async function openMap(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showToast('No se pudo abrir el mapa.', 'error');
    }
  }

  async function saveRoute(id: string) {
    if (isDemo) {
      const savedNow = toggleDemoSavedRoute(id);
      showToast(savedNow ? 'Ruta guardada en tus favoritas.' : 'Ruta quitada de favoritas.', 'success');
      return;
    }
    if (!session) { router.navigate('/login'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await createRecord('saved-routes', { user_id: session.user.id, route_id: id }, 'Guardando ruta…');
      showToast('Ruta guardada en tu cuenta.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function registerVisit(placeId: string, placeName = 'Lugar') {
    if (isDemo) {
      addDemoVisit(placeId, placeName);
      showToast('Visita registrada en tu historial.', 'success');
      return;
    }
    if (!session) { router.navigate('/login'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await createRecord('place-visits', { user_id: session.user.id, place_id: placeId }, 'Registrando visita…');
      showToast('Visita registrada.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo registrar la visita.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Catálogo turístico" subtitle="Lugares publicados ordenados por distancia, precio y calificación">
      <SponsoredCampaignBanner placement="catalog" origin={originPoint} />

      <View style={styles.tabs}>
        <Chip label="Lugares" selected={kind === 'places'} onPress={() => { setKind('places'); setSelected(null); }} />
        <Chip label="Rutas" selected={kind === 'routes'} onPress={() => { setKind('routes'); setSelected(null); }} />
      </View>

      <FormField
        label="Buscar"
        value={query}
        onChangeText={setQuery}
        placeholder="Nombre, servicio o descripción"
        accessibilityLabel="Buscar en catálogo turístico"
      />

      {kind === 'places' ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Categoría principal</AppText>
          <View style={styles.chipRow}>
            <Chip label="Todas" selected={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
            {(['gastronomia', 'cultura', 'naturaleza'] as PlaceCategory[]).map((cat) => (
              <Chip
                key={cat}
                label={categoryLabels[cat]}
                selected={categoryFilter === cat}
                onPress={() => setCategoryFilter(cat)}
              />
            ))}
          </View>
          <AppText variant="label">Ordenar lugares por</AppText>
          <View style={styles.chipRow}>
            {([
              ['distance', 'Más cercanos'],
              ['price', 'Menor precio'],
              ['rating', 'Mejor calificación'],
              ['recommended', 'Relevancia'],
            ] as [CatalogSortOption, string][]).map(([key, label]) => (
              <Chip key={key} label={label} selected={sortBy === key} onPress={() => setSortBy(key)} />
            ))}
          </View>
        </View>
      ) : null}

      {loading ? <LoadingState label="Cargando catálogo desde Render…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {!loading && !error && (kind === 'places' ? filteredPlaces.length === 0 : filteredRoutes.length === 0) ? (
        <AppText>No hay registros publicados que coincidan con tu búsqueda.</AppText>
      ) : null}

      {kind === 'places'
        ? filteredPlaces.map((place) => {
            const distKm = Math.round(haversineKm(originPoint, place) * 10) / 10;
            const map = mapUrl(place.raw);
            return (
              <ListCard
                key={place.id}
                title={place.name}
                body={`${place.description}\n${categoryLabels[place.primaryCategory]}${place.reviewCount > 0 ? ` · ★ ${place.averageRating} (${place.reviewCount})` : ''} · A ${distKm} km · Bs ${place.estimatedCost} · ${place.visitMinutes} min`}
                onPress={() => router.navigate(`/turista/lugar/${place.id}`)}
                footer={
                  <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
                    {place.tags.length > 0 ? (
                      <AppText variant="micro" color="inkMuted">
                        Servicios: {place.tags.slice(0, 4).join(' · ')}
                      </AppText>
                    ) : null}
                    <PlacePhoto key={place.id} name={place.name} />
                    <View style={styles.actionRow}>
                      {map ? <Button title="Ver mapa" size="sm" variant="secondary" onPress={() => { void openMap(map); }} /> : null}
                      <Button
                        title="Reseñas"
                        size="sm"
                        variant="secondary"
                        onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId: place.id } })}
                      />
                      <Button
                        title="Registrar visita"
                        size="sm"
                        variant="soft"
                        disabled={saving}
                        onPress={() => { void registerVisit(place.id, place.name); }}
                      />
                    </View>
                  </View>
                }
              />
            );
          })
        : filteredRoutes.map((row) => {
            const pricing = calculateDiscountedCost(Number(row.budget ?? 0), activeCoupon);
            const routeBody = pricing.discountPercent > 0
              ? `Bs ${pricing.finalCost} (antes Bs ${pricing.originalCost}, -${pricing.discountPercent}%) · ${text(row.available_minutes)} min`
              : `Bs ${text(row.budget)} · ${text(row.available_minutes)} min`;

            return (
              <ListCard
                key={row.id}
                title={text(row.name)}
                body={routeBody}
                onPress={() => router.navigate(`/turista/ruta/${row.id}`)}
                footer={
                  <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
                    <View style={styles.actionRow}>
                      <Button
                        title={selected === row.id ? 'Ocultar paradas' : 'Ver paradas'}
                        size="sm"
                        variant="secondary"
                        onPress={() => setSelected(selected === row.id ? null : row.id)}
                      />
                      <Button title="Guardar" size="sm" disabled={saving} onPress={() => { void saveRoute(row.id); }} />
                    </View>
                    {selected === row.id ? (
                      <>
                        {stops.loading ? <AppText variant="caption">Cargando paradas…</AppText> : null}
                        {stops.error ? <ErrorState message={stops.error} onRetry={stops.retry} /> : null}
                        {!stops.loading && !stops.error && !stops.data?.length ? (
                          <AppText variant="caption">Sin paradas visibles.</AppText>
                        ) : null}
                        {stops.data
                          ?.slice()
                          .sort((a, b) => Number(a.position) - Number(b.position))
                          .map((stop) => {
                            const place = data?.places.find((item) => item.id === stop.place_id);
                            const url = place ? mapUrl(place.raw) : null;
                            return (
                              <ListCard
                                key={stop.id}
                                title={`${text(stop.position)}. ${place?.name || 'Lugar no publicado'}`}
                                body={`${text(stop.visit_minutes)} min de visita`}
                                footer={url ? <Button title="Ver ubicación" size="sm" variant="secondary" onPress={() => { void openMap(url); }} /> : undefined}
                              />
                            );
                          })}
                      </>
                    ) : null}
                  </View>
                }
              />
            );
          })}
      <Button title="Actualizar catálogo" variant="secondary" disabled={loading} onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
