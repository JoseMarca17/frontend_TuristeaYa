import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { LocationCard } from '@/features/turista/components/location-card';
import { RouteStatus } from '@/features/turista/components/route-status';
import { loadBackendRoute, type BackendPlannedRoute, type BackendRoutePlace } from '@/features/turista/data/backend-routes';
import { realPlaces } from '@/features/turista/data/real-places';
import { categoryLabels } from '@/features/turista/data/route-planner';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

type LocalRoute = NonNullable<ReturnType<ReturnType<typeof useRoutes>['findRoute']>>;
type DisplayRoute = BackendPlannedRoute | LocalRoute;
type DisplayPlace = BackendRoutePlace | (typeof realPlaces)[number];

export default function RutaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { findRoute, routes, ready, busy, repository } = useRoutes();
  const session = useAuthStore((s) => s.session);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const showToast = useUiStore((s) => s.showToast);

  const localRoute = findRoute(id);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (localRoute) return { route: localRoute as DisplayRoute, savedRow: null as CatalogRow | null, catalogPlaces: [] as CatalogRow[] };
      const [remote, savedRows, catalogPlaces] = await Promise.all([
        loadBackendRoute(id, signal, session?.user.id),
        session
          ? listRecords('saved-routes', { signal, private: true, filters: { user_id: session.user.id, route_id: id } }).catch(() => [])
          : Promise.resolve([]),
        session
          ? listRecords('places', { signal }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const savedRow = savedRows.find((row) => row.route_id === id && row.user_id === session?.user.id) ?? null;
      return { route: remote as DisplayRoute | null, savedRow, catalogPlaces };
    },
    [id, localRoute, session],
  );

  const { data, loading, error, retry } = useRemoteData(load);
  const route = data?.route ?? null;
  const savedRow = data?.savedRow ?? null;
  const catalogPlaces = data?.catalogPlaces ?? [];

  // Backend route editor states (for owned Render routes)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const first = places[0];
  const pricing = calculateDiscountedCost(displayed.cost, activeCoupon);

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
    setMutBusy(true);
    try {
      await updateRecord(
        'routes',
        backendRoute.id,
        { name: editName.trim(), budget: b, available_minutes: Math.round(m), visibility: editVisibility },
        'Actualizando ruta en Render…',
      );
      setEditModalOpen(false);
      showToast('Ruta actualizada en Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function deleteBackendRoute() {
    if (!backendRoute || mutBusy) return;
    setMutBusy(true);
    try {
      await deleteRecord('routes', backendRoute.id, 'Eliminando ruta de Render…');
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
    setMutBusy(true);
    try {
      const nextPos = (backendRoute.places.reduce((max, p) => Math.max(max, p.position || 0), 0)) + 1;
      await createRecord(
        'route-stops',
        {
          route_id: backendRoute.id,
          place_id: placeRow.id,
          position: nextPos,
          visit_minutes: Math.max(10, Number(stopMinutes) || 30),
          estimated_cost: Math.max(0, Number(stopCost) || 0),
        },
        'Agregando parada a la ruta…',
      );
      setAddStopOpen(false);
      showToast('Parada agregada en Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo agregar la parada.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function moveStop(index: number, delta: number) {
    if (!backendRoute || mutBusy) return;
    const current = backendRoute.places[index];
    const target = backendRoute.places[index + delta];
    if (!current?.stopId || !target?.stopId) return;
    setMutBusy(true);
    try {
      await Promise.all([
        updateRecord('route-stops', current.stopId, { position: target.position ?? index + delta + 1 }, 'Reordenando paradas…'),
        updateRecord('route-stops', target.stopId, { position: current.position ?? index + 1 }, 'Reordenando paradas…'),
      ]);
      showToast('Orden actualizado.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo reordenar.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function removeStop(stopId: string) {
    if (mutBusy) return;
    setMutBusy(true);
    try {
      await deleteRecord('route-stops', stopId, 'Quitando parada…');
      showToast('Parada eliminada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo quitar la parada.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  async function toggleSavedAccount() {
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
    if (!session) { router.navigate('/login'); return; }
    if (!backendRoute || mutBusy) return;
    setMutBusy(true);
    try {
      await createRecord('offline-downloads', { user_id: session.user.id, route_id: backendRoute.id }, 'Registrando descarga offline…');
      showToast('Ruta guardada para uso sin conexión (VIP).', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Requiere suscripción VIP activa.', 'error');
    } finally {
      setMutBusy(false);
    }
  }

  return (
    <Screen title={displayed.name} subtitle={`${places.length} paradas · ${formatDuration(displayed.durationMin)} aprox.`}>
      <RouteStatus />

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
        <Badge label={displayed.categories.map((category) => categoryLabels[category]).join(' + ') || 'Recorrido'} tone="green" />
        <AppText variant="caption">
          Salida: {displayed.departure} · Bs {displayed.cost} estimados · {displayed.distanceKm} km aprox.
        </AppText>
      </View>

      {first?.point ? (
        <LocationCard point={first.point} title={first.name} note="Mapa de la primera parada. Abre cada lugar para ver su ubicación." />
      ) : null}

      {/* Acciones de dueño en Render */}
      {backendRoute?.isMine ? (
        <View style={styles.ownerPanel}>
          <AppText variant="section">Gestionar mi ruta en Render</AppText>
          <View style={styles.btnGrid}>
            <View style={{ flex: 1 }}>
              <Button title="Editar ruta" size="sm" onPress={openEditModal} disabled={mutBusy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="+ Agregar parada" size="sm" variant="secondary" onPress={() => setAddStopOpen(true)} disabled={mutBusy} />
            </View>
          </View>
          {confirmDelete ? (
            <View style={styles.confirmRow}>
              <AppText variant="caption" style={{ flex: 1 }}>¿Eliminar esta ruta permanentemente?</AppText>
              <Button title="Sí, eliminar" size="sm" disabled={mutBusy} onPress={() => { void deleteBackendRoute(); }} />
              <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </View>
          ) : (
            <Button title="Eliminar ruta" size="sm" variant="soft" disabled={mutBusy} onPress={() => setConfirmDelete(true)} />
          )}
        </View>
      ) : null}

      {places.map((place, index) => {
        const categories = 'categories' in place ? place.categories : [place.category];
        const stopId = 'stopId' in place ? place.stopId : undefined;
        return (
          <ListCard
            key={`${place.id}-${index}`}
            title={`${index + 1}. ${place.name}`}
            body={`${categories.map((category) => categoryLabels[category]).join(' · ') || 'Turismo'} · Visita: ${place.visitMinutes} min · Est.: Bs ${place.estimatedCost}`}
            onPress={() => router.navigate(`/turista/lugar/${place.id}`)}
            footer={
              backendRoute?.isMine && stopId ? (
                <View style={styles.stopControls}>
                  <Button title="↑" size="sm" variant="secondary" disabled={mutBusy || index === 0} onPress={() => { void moveStop(index, -1); }} />
                  <Button title="↓" size="sm" variant="secondary" disabled={mutBusy || index === places.length - 1} onPress={() => { void moveStop(index, 1); }} />
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
            title={savedRow ? '✓ Guardada en mi cuenta (toca para quitar)' : 'Guardar en mi cuenta (Render)'}
            disabled={mutBusy}
            variant={savedRow ? 'secondary' : 'primary'}
            onPress={() => { void toggleSavedAccount(); }}
          />
          <Button
            title="Descargar offline (VIP)"
            variant="soft"
            disabled={mutBusy}
            onPress={() => { void downloadOffline(); }}
          />
        </View>
      ) : (
        <RemoteOrLocalSave route={displayed} localRoute={localRoute} ready={ready} busy={busy} repository={repository} />
      )}

      <Button title="Compartir itinerario" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${displayed.id}/compartir`)} />

      {/* Modal Editar Ruta */}
      <Modal visible={editModalOpen} transparent animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <AppText variant="title">Editar ruta</AppText>
              <Pressable onPress={() => setEditModalOpen(false)}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
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
              <Pressable onPress={() => setAddStopOpen(false)}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
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
                  body={String(placeRow.address || placeRow.description || '')}
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
        await createRecord('saved-routes', { route_id: route.id });
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
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
