import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { createRecord, deleteRecord } from '@/services/management';
import { offlineRoutes as demoOfflineRoutes, benefitHistory as demoBenefits } from '@/services/mock/vip';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export function VipPanel() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [demoDownloadedIds, setDemoDownloadedIds] = useState<string[]>(['demo-dl-1']);

  const isDemoVip = !session && demoRole === 'vip';

  const load = useCallback(async (signal: AbortSignal) => {
    const [plans, routes, experiences] = await Promise.all([
      listRecords('subscription-plans', { signal }),
      listRecords('routes', { signal }),
      listRecords('experiences', { signal }),
    ]);

    if (!session) {
      return {
        plans,
        routes: routes.filter((r) => r.visibility === 'public'),
        vipExperiences: experiences.filter((e) => e.published !== false && e.vip_only),
        subscriptions: [],
        active: undefined,
        downloads: [],
        redemptions: [],
      };
    }

    const [subscriptions, downloads, redemptions] = await Promise.all([
      listRecords('subscriptions', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('offline-downloads', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('coupon-redemptions', { private: true, signal, filters: { user_id: session.user.id } }).catch(() => []),
    ]);

    const now = Date.now();
    const mySubs = subscriptions.filter((row) => row.user_id === session.user.id);
    const active = mySubs.find(
      (row) => row.status === 'active' && Date.parse(String(row.starts_at)) <= now && Date.parse(String(row.ends_at)) > now,
    );

    return {
      plans,
      routes: routes.filter((r) => r.visibility === 'public' || r.user_id === session.user.id),
      vipExperiences: experiences.filter((e) => e.published !== false && e.vip_only),
      subscriptions: mySubs,
      active,
      downloads: downloads.filter((row) => row.user_id === session.user.id),
      redemptions: redemptions.filter((row) => row.user_id === session.user.id),
    };
  }, [session]);

  const { data, loading, error, retry } = useRemoteData(load);
  const active = data?.active;

  async function addOfflineDownload(routeId: string) {
    if (busyId) return;
    if (isDemoVip) {
      setDemoDownloadedIds((prev) => [...new Set([...prev, routeId])]);
      showToast('Descarga offline simulada en Vista Demo VIP.', 'info');
      return;
    }
    if (!session) { router.navigate('/login'); return; }
    setBusyId(routeId);
    try {
      await createRecord('offline-downloads', { user_id: session.user.id, route_id: routeId }, 'Guardando ruta offline…');
      showToast('Descarga offline registrada en Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Requiere una suscripción VIP activa en Render.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeOfflineDownload(downloadId: string) {
    if (busyId) return;
    if (isDemoVip) {
      setDemoDownloadedIds((prev) => prev.filter((id) => id !== downloadId));
      showToast('Descarga offline quitada en Vista Demo.', 'info');
      return;
    }
    setBusyId(downloadId);
    try {
      await deleteRecord('offline-downloads', downloadId, 'Quitando descarga offline…');
      showToast('Descarga offline eliminada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen title="Mi cuenta VIP" subtitle="Suscripciones, descargas offline y experiencias exclusivas">
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
            label={active || isDemoVip ? 'VIP Activo' : 'Sin VIP activo'}
            tone={active || isDemoVip ? 'green' : 'cream'}
          />
        </View>
        <AppText variant="bodySmall">
          {active
            ? `VIP activo hasta ${new Date(String(active.ends_at)).toLocaleDateString()}. Puedes descargar rutas offline y acceder a experiencias exclusivas.`
            : isDemoVip
              ? 'Vista Demo VIP activa. Para activar VIP real en una cuenta Render, un administrador debe asignar una suscripción desde el Panel Admin.'
              : 'No hay una suscripción VIP activa en esta cuenta. Un administrador puede activarla desde Admin → Planes y VIP.'}
        </AppText>
        <View style={styles.row}>
          <Button title="Experiencias VIP" size="sm" onPress={() => router.navigate('/turista/experiencias')} />
          <Button title="Solicitar activación" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio/reportar')} />
        </View>
      </View>

      {/* Descargas offline (POST / DELETE offline-downloads) */}
      <AppText variant="section">Rutas offline (offline-downloads)</AppText>
      {isDemoVip ? (
        demoOfflineRoutes.map((dl) => (
          <ListCard
            key={dl.id}
            title={dl.name}
            body={`${dl.stopsCount} paradas · ${dl.sizeMb} MB`}
            footer={
              demoDownloadedIds.includes(dl.id) ? (
                <Button title="Quitar descarga (Demo)" size="sm" variant="soft" onPress={() => { void removeOfflineDownload(dl.id); }} />
              ) : (
                <Button title="Descargar offline (Demo)" size="sm" onPress={() => { void addOfflineDownload(dl.id); }} />
              )
            }
          />
        ))
      ) : (
        <>
          {data?.downloads.map((dl) => {
            const routeName = data.routes.find((r) => r.id === dl.route_id)?.name || `Ruta ${String(dl.route_id).slice(0, 8)}`;
            return (
              <ListCard
                key={dl.id}
                title={String(routeName)}
                body={dl.created_at ? `Descargada el ${new Date(String(dl.created_at)).toLocaleDateString()}` : 'Descargada recientemente'}
                footer={
                  <View style={styles.row}>
                    <Button title="Abrir ruta" size="sm" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${dl.route_id}`)} />
                    <Button title="Eliminar descarga" size="sm" variant="soft" disabled={busyId !== null} onPress={() => { void removeOfflineDownload(dl.id); }} />
                  </View>
                }
              />
            );
          })}
          {data?.routes.slice(0, 3).map((r) => {
            const already = data.downloads.some((dl) => dl.route_id === r.id);
            if (already) return null;
            return (
              <ListCard
                key={r.id}
                title={String(r.name)}
                body={`Bs ${r.budget} · ${r.available_minutes} min`}
                footer={
                  <Button
                    title={busyId === r.id ? 'Descargando…' : 'Descargar offline (POST)'}
                    size="sm"
                    disabled={busyId !== null}
                    onPress={() => { void addOfflineDownload(r.id); }}
                  />
                }
              />
            );
          })}
        </>
      )}

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

      {/* Planes */}
      <AppText variant="section">Planes VIP disponibles</AppText>
      {data?.plans.slice(0, 6).map((plan) => (
        <ListCard key={plan.id} title={String(plan.name)} body={`${plan.currency} ${plan.price} · ${plan.period_days} días`} />
      ))}

      {/* Historial */}
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
