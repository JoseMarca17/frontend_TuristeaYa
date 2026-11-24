import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { LoadingState } from '@/components/ui/loading-state';
import { CategoryPicker } from '@/features/turista/components/category-picker';
import { RouteMap } from '@/features/turista/components/route-map';
import { zonePoints } from '@/features/turista/data/discovery';
import { realPlaces } from '@/features/turista/data/real-places';
import { useSelectedLocation } from '@/features/turista/location-context';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import {
  FREE_ROUTE_MAX_STOPS,
  generateRouteAlternatives,
  type GeneratedRouteAlternative,
  type PlannerPlaceInput,
  type RoutePreference,
  VIP_ROUTE_MAX_STOPS,
} from '@/services/domain-rules';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const prefOptions: { key: RoutePreference; label: string }[] = [
  { key: 'balanced', label: 'Equilibrada' },
  { key: 'less_walking', label: 'Menor caminata' },
  { key: 'lower_cost', label: 'Más económica' },
  { key: 'top_rated', label: 'Mejor valorada' },
];

export default function CrearRutaScreen() {
  const { criteria, setCriteria } = useRoutes();
  const { location } = useSelectedLocation();
  const session = useAuthStore((s) => s.session);
  const hasActiveVip = useAuthStore((s) => s.hasActiveVip);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const createDemoRoute = useDemoStore((s) => s.createRoute);
  const applyFilters = useRouteFilterStore((s) => s.applyFilters);
  const showToast = useUiStore((s) => s.showToast);

  const isVip = hasActiveVip || demoRole === 'vip';
  const maxStopsAllowed = isVip ? VIP_ROUTE_MAX_STOPS : FREE_ROUTE_MAX_STOPS;

  const [name, setName] = useState('');
  const [budget, setBudget] = useState(String(criteria.budget || 180));
  const [minutes, setMinutes] = useState(String(criteria.minutes || 240));
  const [categories, setCategories] = useState(criteria.categories);
  const [preference, setPreference] = useState<RoutePreference>('balanced');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [alternatives, setAlternatives] = useState<GeneratedRouteAlternative<PlannerPlaceInput>[] | null>(null);
  const [selectedAltKey, setSelectedAltKey] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = useCallback(async (signal: AbortSignal) => {
    const [places, placeCats, cats, reviews] = await Promise.all([
      listRecords('places', { signal }).catch(() => []),
      listRecords('place-categories', { signal }).catch(() => []),
      listRecords('categories', { signal }).catch(() => []),
      listRecords('reviews', { signal }).catch(() => []),
    ]);

    const catSlugMap = new Map(
      cats.map((c) => {
        const s = String(c.slug || c.name || '').toLowerCase();
        const normalized = s.includes('gastr') ? 'gastronomia' : s.includes('natur') ? 'naturaleza' : 'cultura';
        return [c.id, normalized];
      }),
    );

    const placeCatMap = new Map<string, string>();
    for (const link of placeCats) {
      const pid = String(link.place_id || '');
      if (!pid || placeCatMap.has(pid)) continue;
      const slug = catSlugMap.get(String(link.category_id || ''));
      if (slug) placeCatMap.set(pid, slug);
    }

    const reviewAgg = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      if (r.hidden) continue;
      const pid = String(r.place_id || '');
      const rating = Number(r.rating);
      if (!pid || !Number.isFinite(rating)) continue;
      const cur = reviewAgg.get(pid) || { sum: 0, count: 0 };
      cur.sum += rating;
      cur.count += 1;
      reviewAgg.set(pid, cur);
    }

    const mapped: PlannerPlaceInput[] = places
      .filter((p) => p.published !== false && p.latitude != null && p.longitude != null)
      .map((p) => {
        const agg = reviewAgg.get(p.id);
        return {
          id: p.id,
          name: String(p.name || 'Lugar turístico'),
          category: placeCatMap.get(p.id) || 'cultura',
          tags: Array.isArray(p.services) ? p.services.map(String) : [],
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          estimatedCost: Number(p.estimated_cost ?? 0),
          visitMinutes: Math.max(15, Number(p.visit_minutes ?? 45)),
          averageRating: agg && agg.count > 0 ? agg.sum / agg.count : 4.2,
          published: p.published !== false,
          zoneId: p.zone_id ? String(p.zone_id) : null,
        };
      });

    if (mapped.length > 0) return mapped;
    return realPlaces.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      latitude: p.point.latitude,
      longitude: p.point.longitude,
      estimatedCost: p.estimatedCost ?? 0,
      visitMinutes: p.visitMinutes ?? 45,
      averageRating: 4.5,
      published: true,
    }));
  }, []);

  const { data: catalogPlaces, loading: loadingPlaces } = useRemoteData(loadCatalog);

  function validateNumbers() {
    const maxBudget = Number(budget.replace(',', '.'));
    const maxMinutes = Number(minutes.replace(',', '.'));
    const origin =
      location.latitude != null && location.longitude != null
        ? { latitude: location.latitude, longitude: location.longitude }
        : zonePoints[location.label] ?? { latitude: -16.4955, longitude: -68.1336 };

    if (!budget.trim() || !Number.isFinite(maxBudget) || maxBudget < 0) {
      setError('Escribe un presupuesto válido, desde Bs 0.');
      return null;
    }
    if (!minutes.trim() || !Number.isFinite(maxMinutes) || maxMinutes <= 0) {
      setError('Escribe un tiempo disponible mayor que cero.');
      return null;
    }
    return { maxBudget, maxMinutes, origin };
  }

  function handleGenerateAlternatives() {
    const parsed = validateNumbers();
    if (!parsed) return;
    if (!catalogPlaces || catalogPlaces.length === 0) {
      setError('Aún estamos cargando el catálogo de lugares publicados.');
      return;
    }
    setError('');
    const generated = generateRouteAlternatives({
      origin: parsed.origin,
      places: catalogPlaces,
      budget: parsed.maxBudget,
      availableMinutes: parsed.maxMinutes,
      categories,
      preference,
      maxStops: maxStopsAllowed,
    });
    if (generated.length === 0) {
      setAlternatives([]);
      setSelectedAltKey('');
      setError('Ninguna combinación de lugares cabe dentro de tu presupuesto y tiempo actual. Amplía el tiempo o presupuesto.');
      return;
    }
    setAlternatives(generated);
    setSelectedAltKey(generated[0].key);
    showToast(`Se generaron ${generated.length} alternativas optimizadas sin superar tus límites.`, 'success');
  }

  async function saveAlternativeToRender(alt: GeneratedRouteAlternative<PlannerPlaceInput>) {
    const parsed = validateNumbers();
    if (!parsed || busy) return;
    if (isDemo) {
      const demoId = `demo-route-${Date.now()}`;
      const routeName = name.trim() || `${alt.title} (${location.label})`;
      createDemoRoute({
        id: demoId,
        userId: `demo-${demoRole}`,
        isMine: true,
        visibility,
        shareSlug: randomUUID(),
        preference: alt.preference,
        createdAt: new Date().toISOString(),
        name: routeName,
        placeIds: alt.metrics.stops.map((s) => s.place.id),
        categories: ['cultura'],
        cost: alt.metrics.finalCost,
        durationMin: alt.metrics.totalDurationMinutes,
        distanceKm: alt.metrics.totalDistanceKm,
        visited: false,
        departure: location.label,
        origin: parsed.origin,
        places: alt.metrics.stops.map((s) => ({
          id: s.place.id,
          stopId: `demo-stop-${s.place.id}-${s.position}`,
          position: s.position,
          name: s.place.name,
          description: '',
          address: location.label,
          point: { latitude: s.place.latitude, longitude: s.place.longitude },
          estimatedCost: s.estimatedCost,
          visitMinutes: s.visitMinutes,
          categories: [(s.place.category as 'cultura' | 'gastronomia' | 'naturaleza') || 'cultura'],
        })),
      });
      showToast('Ruta guardada en tu vista demo.', 'success');
      router.replace(`/turista/ruta/${demoId}`);
      return;
    }
    if (!session) {
      router.navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const shareSlug = randomUUID();
      const routeName = name.trim() || `${alt.title} (${location.label})`;
      const created = await createRecord<{ id: string }>(
        'routes',
        {
          user_id: session.user.id,
          name: routeName,
          budget: parsed.maxBudget,
          available_minutes: Math.round(parsed.maxMinutes),
          origin_lat: parsed.origin.latitude,
          origin_lng: parsed.origin.longitude,
          preference: alt.preference === 'lower_cost' ? 'lower_cost' : 'less_walking',
          visibility,
          share_slug: shareSlug,
        },
        'Guardando ruta y paradas…',
      );
      if (created?.id) {
        for (const stop of alt.metrics.stops) {
          await createRecord(
            'route-stops',
            {
              route_id: created.id,
              place_id: stop.place.id,
              position: stop.position,
              arrival_at: stop.arrivalIso,
              visit_minutes: stop.visitMinutes,
              travel_minutes: stop.travelMinutes,
              travel_meters: stop.travelMeters,
              estimated_cost: stop.estimatedCost,
            },
            `Guardando parada ${stop.position} de ${alt.metrics.stops.length}…`,
          );
        }
        showToast('Ruta optimizada y paradas guardadas.', 'success');
        router.replace(`/turista/ruta/${created.id}`);
      } else {
        router.replace('/turista/rutas-disponibles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la ruta generada.');
    } finally {
      setBusy(false);
    }
  }

  function searchExisting() {
    const parsed = validateNumbers();
    if (!parsed) return;
    setError('');
    setCriteria({
      categories: categories.length ? categories : ['cultura'],
      budget: parsed.maxBudget,
      minutes: parsed.maxMinutes,
      origin: parsed.origin,
      departure: location.label,
      order: 'time',
      maxDistance: null,
    });
    applyFilters({
      categories,
      maxBudget: parsed.maxBudget,
      maxMinutes: parsed.maxMinutes,
      maxDistanceKm: null,
      order: 'time',
      visibility: 'all',
    });
    router.navigate('/turista/rutas-disponibles');
  }

  async function createEmptyInRender() {
    if (!name.trim()) {
      setError('Escribe un nombre para crear la ruta.');
      return;
    }
    const parsed = validateNumbers();
    if (!parsed) return;
    if (isDemo) {
      const demoId = `demo-route-${Date.now()}`;
      createDemoRoute({
        id: demoId,
        userId: `demo-${demoRole}`,
        isMine: true,
        visibility,
        name: name.trim(),
        placeIds: [],
        categories: categories.length ? categories : ['cultura'],
        cost: parsed.maxBudget,
        durationMin: Math.round(parsed.maxMinutes),
        distanceKm: 0,
        visited: false,
        departure: location.label,
        origin: parsed.origin,
        places: [],
      });
      showToast('Ruta creada. Ahora puedes agregar paradas.', 'success');
      router.replace(`/turista/ruta/${demoId}`);
      return;
    }
    if (!session) {
      router.navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createRecord<{ id: string }>(
        'routes',
        {
          user_id: session.user.id,
          name: name.trim(),
          budget: parsed.maxBudget,
          available_minutes: Math.round(parsed.maxMinutes),
          origin_lat: parsed.origin.latitude,
          origin_lng: parsed.origin.longitude,
          preference: preference === 'lower_cost' ? 'lower_cost' : 'less_walking',
          visibility,
          share_slug: randomUUID(),
        },
        'Creando ruta…',
      );
      showToast('Ruta creada. Ahora puedes agregar paradas.', 'success');
      if (created?.id) router.replace(`/turista/ruta/${created.id}`);
      else router.replace('/turista/rutas-disponibles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la ruta.');
    } finally {
      setBusy(false);
    }
  }

  const originPoint =
    location.latitude != null && location.longitude != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : zonePoints[location.label] ?? { latitude: -16.4955, longitude: -68.1336 };

  const activeAlt = alternatives?.find((alt) => alt.key === selectedAltKey) ?? alternatives?.[0] ?? null;

  return (
    <Screen title="Generador inteligente de rutas" subtitle="Calcula alternativas reales dentro de tu presupuesto y tiempo">
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <AppText variant="section">Parámetros del recorrido</AppText>
          <Badge label={isVip ? `VIP: hasta ${maxStopsAllowed} paradas` : `Estándar: máx ${maxStopsAllowed} paradas`} tone={isVip ? 'green' : 'cream'} />
        </View>
        {loadingPlaces ? <LoadingState label="Cargando lugares publicados…" /> : null}
        <FormField
          label="Nombre de tu ruta (opcional al generar)"
          placeholder="Ej. Mi tarde por Sopocachi y Miradores"
          value={name}
          onChangeText={setName}
        />
        <FormField
          label="Presupuesto máximo (Bs)"
          keyboardType="decimal-pad"
          value={budget}
          onChangeText={setBudget}
        />
        <FormField
          label="Tiempo disponible (minutos)"
          keyboardType="number-pad"
          value={minutes}
          onChangeText={setMinutes}
        />
        <View style={{ gap: 6 }}>
          <AppText variant="label">Prioridad de optimización</AppText>
          <View style={styles.rowWrap}>
            {prefOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={preference === opt.key}
                onPress={() => setPreference(opt.key)}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label">Visibilidad</AppText>
          <View style={styles.rowWrap}>
            <Chip label="Privada" selected={visibility === 'private'} onPress={() => setVisibility('private')} />
            <Chip label="Pública" selected={visibility === 'public'} onPress={() => setVisibility('public')} />
          </View>
        </View>
        <CategoryPicker value={categories} onChange={setCategories} />
        <AppText variant="label">Punto de partida: {location.label}</AppText>
        <Button title="Cambiar punto de partida" variant="secondary" size="sm" onPress={() => router.navigate('/turista/ubicacion')} />
        {error ? <AppText variant="bodySmall" style={{ color: '#b91c1c' }} accessibilityLiveRegion="polite">{error}</AppText> : null}

        <Button
          title="Generar alternativas optimizadas"
          disabled={loadingPlaces || busy}
          onPress={handleGenerateAlternatives}
        />
        <Button
          title={session || isDemo ? (busy ? 'Creando…' : 'Crear ruta vacía manual') : 'Inicia sesión para guardar'}
          variant="secondary"
          disabled={busy}
          onPress={() => { void createEmptyInRender(); }}
        />
        <Button title="Buscar rutas existentes con estos límites" variant="soft" onPress={searchExisting} />
      </View>

      {alternatives && alternatives.length > 0 ? (
        <View style={styles.card}>
          <AppText variant="section">Alternativas generadas ({alternatives.length})</AppText>
          <AppText variant="caption" color="inkSoft">
            Recorridos ordenados dentro de tu presupuesto (≤ Bs {budget}) y tiempo (≤ {minutes} min).
          </AppText>
          <View style={styles.rowWrap}>
            {alternatives.map((alt) => (
              <Chip
                key={alt.key}
                label={alt.title}
                selected={activeAlt?.key === alt.key}
                onPress={() => setSelectedAltKey(alt.key)}
              />
            ))}
          </View>

          {activeAlt ? (
            <View style={{ gap: spacing.sm }}>
              <RouteMap
                origin={originPoint}
                stops={activeAlt.metrics.stops.map((s) => ({
                  id: s.place.id,
                  name: s.place.name,
                  latitude: s.place.latitude,
                  longitude: s.place.longitude,
                  position: s.position,
                }))}
                title={`Polilínea · ${activeAlt.title}`}
              />
              <ListCard
                title={activeAlt.title}
                body={`Costo total: Bs ${activeAlt.metrics.finalCost} · Tiempo total: ${activeAlt.metrics.totalDurationMinutes} min · Distancia: ${activeAlt.metrics.totalDistanceKm} km`}
              />
              {activeAlt.metrics.stops.map((stop) => (
                <ListCard
                  key={stop.place.id}
                  title={`${stop.position}. ${stop.place.name}`}
                  body={`Traslado ${stop.travelMinutes} min · Visita ${stop.visitMinutes} min · Est. Bs ${stop.estimatedCost}`}
                />
              ))}
              <Button
                title={session || isDemo ? (busy ? 'Guardando…' : 'Guardar esta ruta') : 'Inicia sesión para guardar'}
                disabled={busy}
                onPress={() => { void saveAlternativeToRender(activeAlt); }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <Button
        title="Ver todas las rutas sin filtros"
        variant="soft"
        onPress={() => {
          useRouteFilterStore.getState().resetFilters();
          router.navigate('/turista/rutas-disponibles');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
