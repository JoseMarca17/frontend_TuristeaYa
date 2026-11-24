import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SponsoredCampaignBanner } from '@/components/ads/sponsored-banner';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RouteMap } from '@/features/turista/components/route-map';
import { RouteStatus } from '@/features/turista/components/route-status';
import { loadBackendRoute, type BackendPlannedRoute, type BackendRoutePlace } from '@/features/turista/data/backend-routes';
import { realPlaces } from '@/features/turista/data/real-places';
import { categoryLabels } from '@/features/turista/data/route-planner';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import {
  calculateRouteMetrics,
  computeSnapshotHash,
  detectRouteSnapshotDrift,
  optimizeStopsNearestNeighbor,
} from '@/services/domain-rules';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { createDemoId, useDemoStore } from '@/stores/use-demo-store';
import { useOfflineStore } from '@/stores/use-offline-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

type LocalRoute = NonNullable<ReturnType<ReturnType<typeof useRoutes>['findRoute']>>;
type DisplayRoute = BackendPlannedRoute | LocalRoute;
type DisplayPlace = BackendRoutePlace | (typeof realPlaces)[number];

export default function RutaDetailScreen() {
  const { id, hash: sharedHash } = useLocalSearchParams<{ id: string; hash?: string }>();
  const { findRoute, routes, ready, busy, repository } = useRoutes();
  const session = useAuthStore((s) => s.session);
  const hasActiveVip = useAuthStore((s) => s.hasActiveVip);
  const demoRole = useAuthStore((s) => s.demoRole);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const offlineItems = useOfflineStore((s) => s.items);
  const saveRouteOffline = useOfflineStore((s) => s.saveRouteOffline);
  const showToast = useUiStore((s) => s.showToast);

  const isVip = hasActiveVip || demoRole === 'vip';
  const isDemo = !session && Boolean(demoRole);
  const demoRoutes = useDemoStore((s) => s.routes);
  const demoSavedIds = useDemoStore((s) => s.savedRouteIds);
  const updateDemoRoute = useDemoStore((s) => s.updateRoute);
  const deleteDemoRoute = useDemoStore((s) => s.deleteRoute);
  const toggleDemoSaved = useDemoStore((s) => s.toggleSavedRoute);
  const demoPlaces = useDemoStore((s) => s.places);
  const demoRouteMatch = isDemo ? demoRoutes.find((r) => r.id === id) : undefined;
  const localRoute = findRoute(id);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (demoRouteMatch) {
        const remotePlaces = await listRecords('places', { signal }).catch(() => []);
        return {
          route: demoRouteMatch as DisplayRoute,
          savedRow: null as CatalogRow | null,
          catalogPlaces: [...demoPlaces, ...remotePlaces].filter((row) => row.published !== false),
        };
      }
      if (localRoute) return { route: localRoute as DisplayRoute, savedRow: null as CatalogRow | null, catalogPlaces: [] as CatalogRow[] };
      const [remote, savedRows, catalogPlaces] = await Promise.all([
        loadBackendRoute(id, signal, session?.user.id),
        session
          ? listRecords('saved-routes', { signal, private: true, filters: { user_id: session.user.id, route_id: id } }).catch(() => [])
          : Promise.resolve([]),
        session || isDemo
          ? listRecords('places', { signal }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const savedRow = savedRows.find((row) => row.route_id === id && row.user_id === session?.user.id) ?? null;
      return {
        route: remote as DisplayRoute | null,
        savedRow,
        catalogPlaces: [...(isDemo ? demoPlaces : []), ...catalogPlaces].filter((row) => row.published !== false),
      };
    },
    [id, localRoute, demoRouteMatch, session, isDemo, demoPlaces],
  );

  const { data, loading, error, retry } = useRemoteData(load);
  const route = data?.route ?? null;
  const savedRow = data?.savedRow ?? null;
  const catalogPlaces = data?.catalogPlaces ?? [];

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [mutBusy, setMutBusy] = useState(false);

  const backendRoute = route && 'places' in route ? route : null;

  const [editName, setEditName] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>('private');

  const [stopMinutes, setStopMinutes] = useState('35');
  const [stopCost, setStopCost] = useState('20');

  if (loading) {
    return (
      <Screen title="Cargando ruta">
        <LoadingState label="Cargando ruta y paradas reales desde Render…" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen title="No se pudo cargar la ruta">
        <ErrorState message={error} onRetry={retry} />
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!route) {
    return (
      <Screen title="Ruta no disponible">
        <RouteStatus />
        <Button title="Ver todas las rutas" onPress={() => router.replace('/turista/rutas-disponibles')} />
      </Screen>
    );
  }

  const savedLocal = routes.find((item) => item.id === id || item.sourceId === id);
  const displayed = savedLocal ?? route;
  const places: DisplayPlace[] =
    'places' in displayed
      ? displayed.places
      : displayed.placeIds
          .map((placeId) => realPlaces.find((place) => place.id === placeId))
          .filter((place): place is (typeof realPlaces)[number] => Boolean(place));

  const mapStops = places
    .filter((p) => Boolean(p.point))
    .map((p, idx) => ({
      id: p.id,
      name: p.name,
      latitude: p.point!.latitude,
      longitude: p.point!.longitude,
      position: idx + 1,
    }));

  const plannerInputs = places.map((p) => ({
    id: p.id,
    name: p.name,
    category: 'categories' in p ? p.categories[0] || 'cultura' : p.category,
    latitude: p.point?.latitude ?? displayed.origin.latitude,
    longitude: p.point?.longitude ?? displayed.origin.longitude,
    estimatedCost: p.estimatedCost ?? 0,
    visitMinutes: p.visitMinutes ?? 45,
  }));

  const pricing = calculateDiscountedCost(displayed.cost, activeCoupon);
  const liveCalc = calculateRouteMetrics(displayed.origin, plannerInputs, activeCoupon?.discountPercent ?? 0);
  const currentHash = computeSnapshotHash(
    plannerInputs.map((s) => ({ id: s.id, cost: s.estimatedCost, visitMinutes: s.visitMinutes })),
  );
  const sharedHashChanged = Boolean(sharedHash && sharedHash !== currentHash);
  const offlineSnap = offlineItems.find((item) => item.routeId === displayed.id);
  const driftCheck = offlineSnap
    ? detectRouteSnapshotDrift(
        {
          routeId: offlineSnap.routeId,
          version: 1,
          updatedAt: offlineSnap.syncedAt,
          snapshotHash: offlineSnap.snapshotHash,
          stops: offlineSnap.stops,
        },
        plannerInputs.map((p) => ({ id: p.id, name: p.name, estimatedCost: p.estimatedCost, visitMinutes: p.visitMinutes, published: true })),
      )
    : { changed: false, reasons: [], missingPlaceIds: [] };

  function openEditModal() {
    if (!backendRoute) return;
    setEditName(backendRoute.name);
    setEditBudget(String(backendRoute.cost));
    setEditMinutes(String(backendRoute.durationMin));
    setEditVisibility(backendRoute.visibility);
    setEditModalOpen(true);
  }

  async function saveRouteEdit() {
    if (!backendRoute || mutBusy) return;
    const b = Number(editBudget.replace(',', '.'));
    const m = Number(editMinutes.replace(',', '.'));
    if (!editName.trim() || !Number.isFinite(b) || b < 0 || !Number.isFinite(m) || m <= 0) {
      showToast('Completa nombre, presupuesto y minutos válidos.', 'error');
      return;
    }
    if (isDemo && demoRouteMatch) {
      updateDemoRoute(demoRouteMatch.id, {
        name: editName.trim(),
        cost: b,
        durationMin: Math.round(m),
        visibility: editVisibility,
      });
      setEditModalOpen(false);
      showToast('Ruta actualizada.', 'success');
      return;
    }
    setMutBusy(true);
    try {
      await updateRecord(
        'routes',
        backendRoute.id,
        { name: editName.trim(), budget: b, available_minutes: Math.round(m), visibility: editVisibility },
        'Actualizando ruta…',
      );
      setEditModalOpen(false);
      showToast('Ruta actualizada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function deleteBackendRoute() {
    if (!backendRoute || mutBusy) return;
    const ok = await confirmAction({
      title: 'Eliminar ruta',
      message: `¿Eliminar permanentemente "${backendRoute.name}"?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    if (isDemo && demoRouteMatch) {
      deleteDemoRoute(demoRouteMatch.id);
      showToast('Ruta eliminada.', 'success');
      router.replace('/turista/rutas-disponibles');
      return;
    }
    setMutBusy(true);
    try {
      await deleteRecord('routes', backendRoute.id, 'Eliminando ruta…');
      showToast('Ruta eliminada.', 'success');
      router.replace('/turista/rutas-disponibles');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar la ruta.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function addStop(placeRow: CatalogRow) {
    if (!backendRoute || mutBusy) return;
    const addMins = Math.max(10, Number(stopMinutes) || Number(placeRow.visit_minutes) || 35);
    const addCostVal = Math.max(0, Number(stopCost) || Number(placeRow.estimated_cost) || 0);
    if (liveCalc.rawCost + addCostVal > backendRoute.cost || liveCalc.totalDurationMinutes + addMins > backendRoute.durationMin) {
      const proceed = await confirmAction({
        title: 'Límite de presupuesto o tiempo',
        message: 'Esta parada excede el presupuesto o tiempo límite inicial de la ruta. ¿Agregarla de todos modos?',
        confirmLabel: 'Agregar parada',
      });
      if (!proceed) return;
    }
    if (isDemo && demoRouteMatch) {
      const nextPos = demoRouteMatch.places.length + 1;
      const newStop: BackendRoutePlace = {
        id: placeRow.id,
        stopId: createDemoId('demo-stop'),
        position: nextPos,
        name: String(placeRow.name || 'Parada'),
        description: String(placeRow.description || ''),
        address: String(placeRow.address || ''),
        point: placeRow.latitude != null && placeRow.longitude != null
          ? { latitude: Number(placeRow.latitude), longitude: Number(placeRow.longitude) }
          : demoRouteMatch.origin,
        estimatedCost: addCostVal,
        visitMinutes: addMins,
        categories: ['cultura'],
      };
      const nextPlaces = [...demoRouteMatch.places, newStop];
      updateDemoRoute(demoRouteMatch.id, {
        places: nextPlaces,
        placeIds: nextPlaces.map((p) => p.id),
      });
      setAddStopOpen(false);
      showToast('Parada agregada y totales recalculados.', 'success');
      return;
    }
    setMutBusy(true);
    try {
      const nextPos = backendRoute.places.reduce((max, p) => Math.max(max, p.position || 0), 0) + 1;
      await createRecord(
        'route-stops',
        {
          route_id: backendRoute.id,
          place_id: placeRow.id,
          position: nextPos,
          visit_minutes: addMins,
          estimated_cost: addCostVal,
        },
        'Agregando parada a la ruta…',
      );
      setAddStopOpen(false);
      showToast('Parada agregada y totales recalculados.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo agregar la parada.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function moveStop(index: number, delta: number) {
    if (!backendRoute || mutBusy) return;
    if (isDemo && demoRouteMatch) {
      const next = [...demoRouteMatch.places];
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= next.length) return;
      [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
      updateDemoRoute(demoRouteMatch.id, {
        places: next.map((p, idx) => ({ ...p, position: idx + 1 })),
        placeIds: next.map((p) => p.id),
      });
      showToast('Orden actualizado.', 'success');
      return;
    }
    const current = backendRoute.places[index];
    const target = backendRoute.places[index + delta];
    if (!current?.stopId || !target?.stopId) return;
    setMutBusy(true);
    try {
      await Promise.all([
        updateRecord('route-stops', current.stopId, { position: target.position ?? index + delta + 1 }, 'Reordenando y recalculando…'),
        updateRecord('route-stops', target.stopId, { position: current.position ?? index + 1 }, 'Reordenando y recalculando…'),
      ]);
      showToast('Paradas reordenadas y métricas recalculadas.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo reordenar.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function optimizeBackendStops() {
    if (!backendRoute || mutBusy || backendRoute.places.length <= 1) return;
    const optimized = optimizeStopsNearestNeighbor(
      backendRoute.origin,
      backendRoute.places.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.categories[0] || 'cultura',
        latitude: p.point?.latitude ?? backendRoute.origin.latitude,
        longitude: p.point?.longitude ?? backendRoute.origin.longitude,
        estimatedCost: p.estimatedCost,
        visitMinutes: p.visitMinutes,
        stopId: p.stopId,
      })),
    );
    if (isDemo && demoRouteMatch) {
      const byStopId = new Map(demoRouteMatch.places.map((p) => [p.stopId || p.id, p]));
      const nextPlaces: BackendRoutePlace[] = optimized.flatMap((item, idx) => {
        const base = byStopId.get(item.stopId || item.id);
        return base ? [{ ...base, position: idx + 1 }] : [];
      });
      updateDemoRoute(demoRouteMatch.id, {
        places: nextPlaces,
        placeIds: nextPlaces.map((p) => p.id),
      });
      showToast('Orden optimizado por distancia mínima.', 'success');
      return;
    }
    setMutBusy(true);
    try {
      await Promise.all(
        optimized.map((item, idx) =>
          item.stopId
            ? updateRecord('route-stops', item.stopId, { position: idx + 1 }, 'Optimizando recorrido…')
            : Promise.resolve(null),
        ),
      );
      showToast('Orden optimizado por distancia mínima.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo optimizar el orden.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function removeStop(stopId: string) {
    if (mutBusy) return;
    if (isDemo && demoRouteMatch) {
      const nextPlaces = demoRouteMatch.places
        .filter((p) => (p.stopId || p.id) !== stopId)
        .map((p, idx) => ({ ...p, position: idx + 1 }));
      updateDemoRoute(demoRouteMatch.id, {
        places: nextPlaces,
        placeIds: nextPlaces.map((p) => p.id),
      });
      showToast('Parada quitada y métricas recalculadas.', 'success');
      return;
    }
    setMutBusy(true);
    try {
      await deleteRecord('route-stops', stopId, 'Quitando parada…');
      showToast('Parada eliminada y métricas recalculadas.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo quitar la parada.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function toggleSavedAccount() {
    if (isDemo && backendRoute) {
      const savedNow = toggleDemoSaved(backendRoute.id);
      showToast(savedNow ? 'Ruta guardada en tus favoritas.' : 'Ruta quitada de favoritas.', 'info');
      return;
    }
    if (!session) { router.navigate('/login'); return; }
    if (!backendRoute || mutBusy) return;
    setMutBusy(true);
    try {
      if (savedRow) {
        await deleteRecord('saved-routes', savedRow.id, 'Quitando de rutas guardadas…');
        showToast('Ruta quitada de tu cuenta.', 'info');
      } else {
        await createRecord('saved-routes', { user_id: session.user.id, route_id: backendRoute.id }, 'Guardando ruta en tu cuenta…');
        showToast('Ruta guardada en tu cuenta.', 'success');
      }
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function downloadOffline() {
    if (!session && demoRole !== 'vip') { router.navigate('/login'); return; }
    if (!isVip) {
      showToast('Función VIP bloqueada: necesitas una suscripción VIP vigente para guardar rutas sin conexión.', 'error');
      return;
    }
    if (!backendRoute || mutBusy) return;
    setMutBusy(true);
    try {
      await saveRouteOffline(
        {
          routeId: backendRoute.id,
          userId: session?.user.id || 'demo-vip',
          name: backendRoute.name,
          departure: backendRoute.departure,
          originLat: backendRoute.origin.latitude,
          originLng: backendRoute.origin.longitude,
          totalCost: liveCalc.rawCost || backendRoute.cost,
          totalDurationMinutes: liveCalc.totalDurationMinutes || backendRoute.durationMin,
          totalDistanceKm: liveCalc.totalDistanceKm || backendRoute.distanceKm,
          snapshotHash: currentHash,
          syncedAt: new Date().toISOString(),
          pendingSync: !session,
          stops: places.map((p) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            latitude: p.point?.latitude ?? backendRoute.origin.latitude,
            longitude: p.point?.longitude ?? backendRoute.origin.longitude,
            estimatedCost: p.estimatedCost ?? 0,
            visitMinutes: p.visitMinutes ?? 45,
          })),
        },
        Boolean(session && demoRole !== 'vip'),
      );
      showToast('Ruta guardada para usar sin conexión.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Requiere suscripción VIP activa.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  return (
    <Screen title={displayed.name} subtitle={`${places.length} paradas · ${formatDuration(liveCalc.totalDurationMinutes || displayed.durationMin)} aprox.`}>
      <RouteStatus />
      <SponsoredCampaignBanner placement="detail" origin={displayed.origin} />

      {/* Alerta cuando una ruta compartida o snapshot cambió respecto al catálogo actual */}
      {sharedHashChanged || driftCheck.changed ? (
        <View style={styles.warningCard} accessibilityRole="alert">
          <AppText variant="label" style={{ color: '#991b1b' }}>
            Advertencia: ruta modificada respecto a su versión guardada/compartida
          </AppText>
          <AppText variant="caption">
            {sharedHashChanged
              ? `El enlace compartido corresponde a la versión ${sharedHash} y el estado actual es ${currentHash}.`
              : driftCheck.reasons.slice(0, 2).join(' ')}
          </AppText>
        </View>
      ) : null}

      {/* Cupón canjeado aplicado a esta ruta */}
      {activeCoupon && pricing.discountPercent > 0 ? (
        <View style={styles.discountBox}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="pricetag" size={18} color={colors.primary} />
              <AppText variant="section">Descuento aplicado ({activeCoupon.code})</AppText>
            </View>
            <Badge label={`-${pricing.discountPercent}%`} tone="green" />
          </View>
          <View style={styles.priceRow}>
            <AppText variant="body" style={styles.strike}>Bs {pricing.originalCost}</AppText>
            <AppText variant="title" style={{ fontSize: 20 }}>Bs {pricing.finalCost}</AppText>
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              Ahorras Bs {pricing.discountAmount}
            </AppText>
          </View>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <AppText variant="caption" color="inkSoft">
          {displayed.categories.map((category) => categoryLabels[category]).join(' · ') || 'Recorrido'} · Salida: {displayed.departure}
        </AppText>
        <AppText variant="caption" color="inkSoft">
          Presupuesto Bs {displayed.cost} · Recálculo paradas: Bs {liveCalc.rawCost} · {liveCalc.totalDistanceKm} km ({liveCalc.totalTravelMinutes} min traslado + {liveCalc.totalVisitMinutes} min visita)
        </AppText>
      </View>

      {/* Mapa real del recorrido con polilínea conectando origen y todas las paradas */}
      <RouteMap
        origin={displayed.origin}
        stops={mapStops}
        title="Mapa del recorrido con polilínea"
      />

      {/* Acciones de dueño */}
      {backendRoute?.isMine ? (
        <View style={styles.ownerPanel}>
          <AppText variant="section">Gestionar ruta</AppText>
          <View style={styles.btnGrid}>
            <View style={{ flex: 1 }}>
              <Button title="Editar ruta" size="sm" onPress={openEditModal} disabled={mutBusy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="+ Agregar parada" size="sm" variant="secondary" onPress={() => setAddStopOpen(true)} disabled={mutBusy} />
            </View>
          </View>
          <Button
            title="Optimizar orden (menos caminata)"
            size="sm"
            variant="soft"
            disabled={mutBusy || places.length <= 1}
            onPress={() => { void optimizeBackendStops(); }}
          />
          <Button title="Eliminar ruta" size="sm" variant="soft" disabled={mutBusy} onPress={() => { void deleteBackendRoute(); }} />
        </View>
      ) : null}

      {places.map((place, index) => {
        const categories = 'categories' in place ? place.categories : [place.category];
        const stopId = 'stopId' in place ? place.stopId : undefined;
        const stopMetric = liveCalc.stops[index];
        return (
          <ListCard
            key={`${place.id}-${index}`}
            title={`${index + 1}. ${place.name}`}
            body={`${categories.map((category) => categoryLabels[category]).join(' · ') || 'Turismo'} · Traslado ${stopMetric?.distanceFromPrevKm ?? 0} km (${stopMetric?.travelMinutes ?? 0} min) · Visita: ${place.visitMinutes} min · Est.: Bs ${place.estimatedCost}`}
            onPress={() => router.navigate(`/turista/lugar/${place.id}`)}
            footer={
              backendRoute?.isMine && stopId ? (
                <View style={styles.stopControls}>
                  <Button title="Subir" size="sm" variant="secondary" disabled={mutBusy || index === 0} onPress={() => { void moveStop(index, -1); }} />
                  <Button title="Bajar" size="sm" variant="secondary" disabled={mutBusy || index === places.length - 1} onPress={() => { void moveStop(index, 1); }} />
                  <Button title="Quitar" size="sm" variant="soft" disabled={mutBusy} onPress={() => { void removeStop(stopId); }} />
                </View>
              ) : undefined
            }
          />
        );
      })}

      {/* Guardar en cuenta / dispositivo */}
      {savedLocal ? (
        <View style={styles.localBox}>
          <AppText variant="label">✓ Ruta guardada en este dispositivo</AppText>
          <Button title="Editar paradas locales" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${savedLocal.id}/editar-paradas`)} />
          <Button title="Ver en Mis rutas" onPress={() => router.navigate('/turista/mis-rutas')} />
        </View>
      ) : backendRoute ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={
              savedRow || demoSavedIds.includes(backendRoute.id)
                ? '✓ Guardada en favoritas (quitar)'
                : 'Guardar ruta'
            }
            disabled={mutBusy}
            variant={savedRow || demoSavedIds.includes(backendRoute.id) ? 'secondary' : 'primary'}
            onPress={() => { void toggleSavedAccount(); }}
          />
          <Button
            title={isVip ? 'Descargar para usar sin conexión' : 'Descarga sin conexión (VIP)'}
            variant="soft"
            disabled={mutBusy}
            onPress={() => { void downloadOffline(); }}
          />
        </View>
      ) : (
        <RemoteOrLocalSave route={displayed} localRoute={localRoute} ready={ready} busy={busy} repository={repository} />
      )}

      <Button title="Compartir itinerario con versión" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${displayed.id}/compartir`)} />

      {/* Modal Editar Ruta */}
      <Modal visible={editModalOpen} transparent animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <AppText variant="title">Editar ruta</AppText>
              <Pressable onPress={() => setEditModalOpen(false)} accessibilityLabel="Cerrar modal"><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
            </View>
            <FormField label="Nombre" value={editName} onChangeText={setEditName} />
            <FormField label="Presupuesto (Bs)" value={editBudget} onChangeText={setEditBudget} keyboardType="decimal-pad" />
            <FormField label="Duración (minutos)" value={editMinutes} onChangeText={setEditMinutes} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip label="Privada" selected={editVisibility === 'private'} onPress={() => setEditVisibility('private')} />
              <Chip label="Pública" selected={editVisibility === 'public'} onPress={() => setEditVisibility('public')} />
            </View>
            <Button title={mutBusy ? 'Guardando…' : 'Guardar cambios'} disabled={mutBusy} onPress={() => { void saveRouteEdit(); }} />
          </View>
        </View>
      </Modal>

      {/* Modal Agregar Parada */}
      <Modal visible={addStopOpen} transparent animationType="slide" onRequestClose={() => setAddStopOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.rowBetween}>
              <AppText variant="title">Agregar parada</AppText>
              <Pressable onPress={() => setAddStopOpen(false)} accessibilityLabel="Cerrar catálogo"><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <FormField label="Minutos visita" value={stopMinutes} onChangeText={setStopMinutes} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Costo est. (Bs)" value={stopCost} onChangeText={setStopCost} keyboardType="decimal-pad" />
              </View>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              {catalogPlaces.map((placeRow) => (
                <ListCard
                  key={placeRow.id}
                  title={String(placeRow.name)}
                  body={`${String(placeRow.address || placeRow.description || '')} · Est. Bs ${placeRow.estimated_cost ?? 0}`}
                  onPress={() => { void addStop(placeRow); }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function RemoteOrLocalSave({
  route,
  localRoute,
  ready,
  busy,
  repository,
}: {
  route: DisplayRoute;
  localRoute: LocalRoute | undefined;
  ready: boolean;
  busy: boolean;
  repository: ReturnType<typeof useRoutes>['repository'];
}) {
  const session = useAuthStore((s) => s.session);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (localRoute && !('places' in route)) {
        const savedId = await repository.save(localRoute);
        router.replace(`/turista/ruta/${savedId}`);
      } else {
        if (!session) {
          router.navigate('/login');
          return;
        }
        await createRecord('saved-routes', { user_id: session.user.id, route_id: route.id }, 'Guardando ruta en tu cuenta…');
        setMessage('Ruta guardada en tu cuenta.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
      <Button
        title={saving ? 'Guardando…' : localRoute ? 'Guardar ruta' : 'Guardar en mi cuenta'}
        disabled={saving || busy || (!localRoute && !('places' in route)) || (Boolean(localRoute) && !ready)}
        onPress={() => { void save(); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    backgroundColor: '#fef2f2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: spacing.md,
    gap: 4,
  },
  discountBox: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  strike: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  metaRow: {
    gap: 6,
  },
  ownerPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: spacing.sm,
  },
  btnGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stopControls: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginTop: 6,
  },
  localBox: {
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 28, 22, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.xl,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.md,
  },
});
