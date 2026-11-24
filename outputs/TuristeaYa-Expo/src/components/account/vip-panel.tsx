import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { computeSnapshotHash, getVipStatusSummary } from '@/services/domain-rules';
import { deleteRecord } from '@/services/management';
import { benefitHistory as demoBenefits, offlineRoutes as demoOfflineRoutes } from '@/services/mock/vip';
import type { OfflineRouteSnapshot } from '@/services/offline-storage.types';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useOfflineStore } from '@/stores/use-offline-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export function VipPanel() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoExperiences = useDemoStore((s) => s.experiences);
  const demoRoutes = useDemoStore((s) => s.routes);
  const showToast = useUiStore((s) => s.showToast);

  const offlineItems = useOfflineStore((s) => s.items);
  const offlineSyncing = useOfflineStore((s) => s.syncing);
  const lastGlobalSyncAt = useOfflineStore((s) => s.lastGlobalSyncAt);
  const loadSnapshots = useOfflineStore((s) => s.loadSnapshots);
  const saveRouteOffline = useOfflineStore((s) => s.saveRouteOffline);
  const deleteRouteOffline = useOfflineStore((s) => s.deleteRouteOffline);
  const syncAndDetectChanges = useOfflineStore((s) => s.syncAndDetectChanges);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const isDemoVip = !session && demoRole === 'vip';
  const effectiveUserId = session?.user.id || (isDemoVip ? 'demo-vip' : 'guest');

  const load = useCallback(async (signal: AbortSignal) => {
    if (!session) {
      const plans = [{
        id: 'demo-plan-vip',
        name: 'TuristeaYA VIP Demo',
        price: 0,
        currency: 'Bs',
        period_days: 30,
      }];
      return {
        plans,
        routes: demoRoutes.map((route) => ({
          id: route.id,
          name: route.name,
          budget: route.cost,
          available_minutes: route.durationMin,
          origin_lat: route.origin.latitude,
          origin_lng: route.origin.longitude,
          visibility: route.visibility,
          user_id: route.userId,
        })),
        routeStops: [],
        places: [],
        hours: [],
        vipExperiences: demoExperiences.filter((e) => e.published !== false && e.vip_only),
        subscriptions: [],
        downloads: [],
        redemptions: [],
        reservations: [],
      };
    }
    const [plans, routes, routeStops, places, hours, experiences] = await Promise.all([
      listRecords('subscription-plans', { signal }),
      listRecords('routes', { signal, private: Boolean(session) }),
      listRecords('route-stops', { signal }).catch(() => []),
      listRecords('places', { signal }).catch(() => []),
      listRecords('opening-hours', { signal }).catch(() => []),
      listRecords('experiences', { signal }),
    ]);

    const [subscriptions, downloads, redemptions, reservations] = await Promise.all([
      listRecords('subscriptions', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('offline-downloads', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('coupon-redemptions', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('reservations', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
    ]);

    return {
      plans,
      routes: routes.filter((r) => r.visibility === 'public' || r.user_id === session.user.id),
      routeStops,
      places,
      hours,
      vipExperiences: experiences.filter((e) => e.published !== false && e.vip_only),
      subscriptions: subscriptions.filter((row) => row.user_id === session.user.id),
      downloads: downloads.filter((row) => row.user_id === session.user.id),
      redemptions: redemptions.filter((row) => row.user_id === session.user.id),
      reservations: reservations.filter((row) => row.user_id === session.user.id),
    };
  }, [session, demoExperiences, demoRoutes]);

  const { data, loading, error, retry } = useRemoteData(load);

  const vipSummary = getVipStatusSummary(
    (data?.subscriptions || []) as { id: string; user_id: string; status?: string; starts_at?: string; ends_at?: string }[],
    session?.user.id,
    nowMs,
    isDemoVip,
  );

  useEffect(() => {
    void loadSnapshots(effectiveUserId);
  }, [effectiveUserId, loadSnapshots]);

  const syncLiveSnapshots = useCallback(async () => {
    const places = data?.places;
    if (!places) return;
    const livePlaces = places.map((p) => ({
      id: p.id,
      name: String(p.name || 'Lugar'),
      estimatedCost: Number(p.estimated_cost ?? 0),
      visitMinutes: Number(p.visit_minutes ?? 45),
      published: p.published !== false,
    }));
    const changed = await syncAndDetectChanges(livePlaces, Boolean(session && vipSummary.active));
    if (changed > 0) {
      showToast(`${changed} descarga(s) offline tienen cambios recientes en Render.`, 'info');
    }
  }, [data, session, vipSummary.active, syncAndDetectChanges, showToast]);

  useEffect(() => {
    if (!data?.places) return;
    void syncLiveSnapshots();
  }, [data, syncLiveSnapshots]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleOnline = () => {
      void syncLiveSnapshots();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncLiveSnapshots]);

  function buildRouteSnapshot(routeId: string): OfflineRouteSnapshot | null {
    const route = data?.routes.find((r) => r.id === routeId);
    if (!route) return null;
    const stops = (data?.routeStops || [])
      .filter((s) => s.route_id === routeId)
      .sort((a, b) => Number(a.position) - Number(b.position));
    const stopDetails = stops.map((s) => {
      const place = data?.places.find((p) => p.id === s.place_id);
      const placeHours = (data?.hours || [])
        .filter((h) => h.place_id === s.place_id)
        .map((h) => `${String(h.opens_at).slice(0, 5)}-${String(h.closes_at).slice(0, 5)}`)
        .slice(0, 2)
        .join(', ');
      return {
        id: String(s.place_id || s.id),
        name: String(place?.name || 'Parada turística'),
        address: String(place?.address || 'Ubicación registrada'),
        latitude: Number(place?.latitude ?? route.origin_lat ?? -16.4955),
        longitude: Number(place?.longitude ?? route.origin_lng ?? -68.1336),
        estimatedCost: Number(s.estimated_cost ?? place?.estimated_cost ?? 0),
        visitMinutes: Number(s.visit_minutes ?? place?.visit_minutes ?? 45),
        openingHoursText: placeHours || 'Consultar horario local',
      };
    });

    const totalCost = stopDetails.length > 0
      ? stopDetails.reduce((acc, s) => acc + s.estimatedCost, 0)
      : Number(route.budget ?? 0);
    const totalDurationMinutes = Number(route.available_minutes ?? 120);
    const snapshotHash = computeSnapshotHash(
      stopDetails.map((s) => ({ id: s.id, cost: s.estimatedCost, visitMinutes: s.visitMinutes })),
    );
    const existingDownload = data?.downloads.find((d) => d.route_id === routeId);

    return {
      routeId,
      serverRecordId: existingDownload?.id,
      userId: effectiveUserId,
      name: String(route.name || 'Ruta sin nombre'),
      departure: 'Origen guardado',
      originLat: Number(route.origin_lat ?? -16.4955),
      originLng: Number(route.origin_lng ?? -68.1336),
      totalCost,
      totalDurationMinutes,
      totalDistanceKm: 0,
      snapshotHash,
      syncedAt: new Date().toISOString(),
      pendingSync: !session,
      stops: stopDetails,
    };
  }

  async function addOfflineDownload(routeId: string) {
    if (busyId) return;
    if (!vipSummary.active) {
      showToast('Función bloqueada: tu cuenta requiere suscripción VIP vigente.', 'error');
      return;
    }
    const snap = buildRouteSnapshot(routeId);
    if (!snap) return;
    setBusyId(routeId);
    try {
      await saveRouteOffline(snap, Boolean(session && !isDemoVip));
      showToast('Snapshot completo guardado para uso sin conexión.', 'success');
      if (session) retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar la descarga offline.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeOfflineDownload(routeId: string, name: string, serverDownloadId?: string) {
    if (busyId) return;
    const confirmed = await confirmAction({
      title: 'Eliminar ruta offline',
      message: `¿Quitar "${name}" del almacenamiento offline?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;

    setBusyId(routeId);
    try {
      await deleteRouteOffline(routeId, Boolean(session && !isDemoVip));
      if (serverDownloadId && session) {
        await deleteRecord('offline-downloads', serverDownloadId, 'Quitando registro offline…').catch(() => { });
      }
      showToast('Descarga offline eliminada.', 'info');
      if (session) retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function cancelSubscription(subId: string) {
    if (!session || busyId) return;
    const confirmed = await confirmAction({
      title: 'Cancelar suscripción VIP',
      message: 'Si cancelas, las funciones VIP se bloquearán al expirar o al cambiar de estado.',
      confirmLabel: 'Confirmar cancelación',
      destructive: true,
    });
    if (!confirmed) return;
    setBusyId(subId);
    try {
      const { updateRecord } = await import('@/services/management');
      await updateRecord('subscriptions', subId, { status: 'cancelled' }, 'Actualizando suscripción…');
      showToast('Suscripción marcada como cancelada.', 'info');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'El servidor no permitió cancelar la suscripción.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen title="Mi cuenta VIP" subtitle="Suscripción, mapas sin conexión y beneficios">
      <RoleBanner />
      {loading ? <LoadingState label="Cargando información VIP…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      <View style={styles.statusCard}>
        <View style={styles.rowBetween}>
          <View style={styles.rowGap}>
            <Ionicons name="diamond" size={22} color={colors.primary} />
            <AppText variant="section">Estado de membresía</AppText>
          </View>
          <Badge
            label={vipSummary.active ? `Plan VIP activo` : vipSummary.isExpired ? 'VIP expirado' : 'Sin VIP'}
            tone={vipSummary.active ? 'green' : 'cream'}
          />
        </View>
        <AppText variant="bodySmall">
          {vipSummary.active
            ? `VIP vigente hasta ${vipSummary.expiresAt ? new Date(vipSummary.expiresAt).toLocaleDateString() : 'vigencia actual'}. Anuncios ocultos, rutas ampliadas y descargas sin conexión habilitadas.`
            : vipSummary.isExpired
              ? 'Tu suscripción expiró y los beneficios VIP quedaron bloqueados hasta renovar.'
              : 'Activa un plan VIP para quitar anuncios, descargar mapas offline y acceder a experiencias exclusivas.'}
        </AppText>
        <View style={styles.row}>
          <Button title="Experiencias VIP" size="sm" onPress={() => router.navigate('/turista/experiencias')} />
          <Button
            title={offlineSyncing ? 'Actualizando…' : 'Actualizar rutas sin conexión'}
            size="sm"
            variant="secondary"
            disabled={offlineSyncing}
            onPress={() => { void syncLiveSnapshots(); }}
          />
        </View>
        {lastGlobalSyncAt ? (
          <AppText variant="caption" color="inkMuted">
            Última actualización: {new Date(lastGlobalSyncAt).toLocaleString()}
          </AppText>
        ) : null}
      </View>

      {/* Alertas tempranas VIP */}
      {vipSummary.active ? (
        <ListCard
          title="Alertas tempranas VIP activas"
          body="Acceso prioritario habilitado para experiencias de cupo limitado y anuncios ocultos en toda la app."
        />
      ) : null}

      <AppText variant="section">Rutas guardadas para usar sin conexión ({offlineItems.length})</AppText>
      {!vipSummary.active ? (
        <ListCard
          title="Mapas sin conexión bloqueados"
          body="Activa o renueva tu suscripción VIP para descargar snapshots completos (paradas, horarios, costos y mapa básico)."
        />
      ) : null}

      {offlineItems.map((snap) => (
        <ListCard
          key={snap.routeId}
          title={snap.name}
          body={`${snap.stops.length} paradas · Bs ${snap.totalCost} · ${snap.totalDurationMinutes} min\nSincronizado: ${new Date(snap.syncedAt).toLocaleString()}${snap.pendingSync ? ' · Pendiente de sincronización remota' : ''}`}
          footer={
            <View style={{ gap: spacing.xs }}>
              {snap.hasServerChanges ? (
                <View style={styles.warningBox}>
                  <AppText variant="caption" style={{ color: '#991b1b', fontWeight: '700' }}>
                    Cambios detectados en el servidor:
                  </AppText>
                  <AppText variant="caption">
                    {(snap.changeNotes || []).slice(0, 2).join(' ')}
                  </AppText>
                  <Button
                    title="Actualizar snapshot"
                    size="sm"
                    onPress={() => { void addOfflineDownload(snap.routeId); }}
                  />
                </View>
              ) : null}
              <View style={styles.row}>
                <Button title="Abrir ruta" size="sm" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${snap.routeId}`)} />
                <Button
                  title="Eliminar offline"
                  size="sm"
                  variant="soft"
                  disabled={busyId !== null}
                  onPress={() => { void removeOfflineDownload(snap.routeId, snap.name, snap.serverRecordId); }}
                />
              </View>
            </View>
          }
        />
      ))}

      {vipSummary.active && isDemoVip ? (
        demoOfflineRoutes.map((dl) => (
          <ListCard
            key={dl.id}
            title={`${dl.name} (Ejemplo demo)`}
            body={`${dl.stopsCount} paradas · ${dl.sizeMb} MB`}
            footer={
              <Button
                title="Guardar para usar sin conexión"
                size="sm"
                onPress={() => {
                  void saveRouteOffline(
                    {
                      routeId: dl.id,
                      userId: effectiveUserId,
                      name: dl.name,
                      departure: 'Centro de La Paz',
                      originLat: -16.4955,
                      originLng: -68.1336,
                      totalCost: 85,
                      totalDurationMinutes: 150,
                      totalDistanceKm: 3.2,
                      snapshotHash: `demo-${dl.id}`,
                      syncedAt: new Date().toISOString(),
                      pendingSync: false,
                      stops: [],
                    },
                    false,
                  ).then(() => showToast('Snapshot guardado offline.', 'success'));
                }}
              />
            }
          />
        ))
      ) : null}

      {vipSummary.active ? (
        <>
          <AppText variant="label">Guardar una ruta para usar sin conexión</AppText>
          {data?.routes.slice(0, 4).map((r) => {
            const alreadyLocal = offlineItems.some((item) => item.routeId === r.id);
            if (alreadyLocal) return null;
            return (
              <ListCard
                key={r.id}
                title={String(r.name)}
                body={`Bs ${r.budget} · ${r.available_minutes} min`}
                footer={
                  <Button
                    title={busyId === r.id ? 'Guardando…' : 'Guardar sin conexión'}
                    size="sm"
                    disabled={busyId !== null}
                    onPress={() => { void addOfflineDownload(r.id); }}
                  />
                }
              />
            );
          })}
        </>
      ) : null}

      {/* Experiencias exclusivas VIP */}
      <AppText variant="section">Experiencias exclusivas VIP</AppText>
      {data?.vipExperiences.map((exp) => (
        <ListCard
          key={exp.id}
          title={String(exp.title)}
          body={`${exp.description}\nBs ${exp.price_per_person} por persona · ${new Date(String(exp.starts_at)).toLocaleDateString()}`}
          onPress={() => router.navigate('/turista/experiencias')}
        />
      ))}

      {/* Planes e historial */}
      <AppText variant="section">Planes VIP e historial de suscripciones</AppText>
      {data?.plans.slice(0, 6).map((plan) => (
        <ListCard
          key={plan.id}
          title={String(plan.name)}
          body={`${plan.currency} ${plan.price} · ${plan.period_days} días · Suscripción en línea pendiente de pasarela de pagos en servidor`}
        />
      ))}

      {data?.subscriptions.map((sub) => (
        <ListCard
          key={sub.id}
          title={`Historial VIP (${String(sub.status)})`}
          body={`Desde ${new Date(String(sub.starts_at)).toLocaleDateString()} hasta ${new Date(String(sub.ends_at)).toLocaleDateString()}`}
          footer={
            sub.status === 'active' ? (
              <Button
                title="Cancelar suscripción"
                size="sm"
                variant="soft"
                disabled={busyId !== null}
                onPress={() => { void cancelSubscription(sub.id); }}
              />
            ) : undefined
          }
        />
      ))}

      {isDemoVip ? (
        <>
          <AppText variant="section">Historial de beneficios (Demo)</AppText>
          {demoBenefits.map((b) => (
            <ListCard key={b.id} title={b.title} body={`${b.detail} · ${b.usedLabel}`} />
          ))}
        </>
      ) : null}

      <Button title="Actualizar" variant="secondary" disabled={loading} onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
