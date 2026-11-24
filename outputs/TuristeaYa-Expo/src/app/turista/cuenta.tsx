import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { deleteRecord, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export default function AccountScreen({ section }: { section?: string } = {}) {
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!session) return null;
    const options = { signal, private: true, filters: { user_id: session.user.id } };
    const [notifs, reservs, subs, ticks, saved, visits, redemptions, routes, places] = await Promise.allSettled([
      listRecords('notifications', options),
      listRecords('reservations', options),
      listRecords('subscriptions', options),
      listRecords('tickets', options),
      listRecords('saved-routes', options),
      listRecords('place-visits', options),
      listRecords('coupon-redemptions', options),
      listRecords('routes', { signal }),
      listRecords('places', { signal }),
    ]);

    const routeNames = new Map(
      (routes.status === 'fulfilled' ? routes.value : []).map((r) => [r.id, String(r.name || 'Ruta')]),
    );
    const placeNames = new Map(
      (places.status === 'fulfilled' ? places.value : []).map((p) => [p.id, String(p.name || 'Lugar')]),
    );

    const groups = [
      { label: 'Notificaciones', res: notifs },
      { label: 'Rutas guardadas en mi cuenta', res: saved },
      { label: 'Reservas', res: reservs },
      { label: 'Canjes de cupones', res: redemptions },
      { label: 'Lugares visitados', res: visits },
      { label: 'Suscripciones', res: subs },
      { label: 'Reportes', res: ticks },
    ];

    return groups.map(({ label, res }) => ({
      label,
      routeNames,
      placeNames,
      rows: res.status === 'fulfilled' ? res.value.filter((row) => row.user_id === session.user.id) : [],
      error: res.status === 'rejected' ? String(res.reason?.message || 'No se pudo consultar este recurso.') : '',
    }));
  }, [session]);

  const { data, loading, error, retry } = useRemoteData(load);

  async function markRead(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      await updateRecord('notifications', id, { read_at: new Date().toISOString() }, 'Marcando notificación como leída…');
      showToast('Notificación marcada como leída.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function removeRecord(entity: string, id: string, successMessage: string) {
    if (busy) return;
    setBusy(id);
    try {
      await deleteRecord(entity, id, 'Eliminando registro…');
      showToast(successMessage, 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function markSavedVisited(id: string, currentlyVisited: boolean) {
    if (busy) return;
    setBusy(id);
    try {
      await updateRecord(
        'saved-routes',
        id,
        { visited_at: currentlyVisited ? null : new Date().toISOString() },
        'Actualizando ruta guardada…',
      );
      showToast(currentlyVisited ? 'Marcada como pendiente.' : 'Marcada como visitada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={section || 'Mi cuenta'} subtitle="Historial y datos sincronizados en Render">
      <RoleBanner />
      {!session ? (
        <View style={styles.emptyBox}>
          <AppText variant="bodySmall">Inicia sesión en Render para consultar tus notificaciones, reservas, rutas guardadas y tickets.</AppText>
          <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} />
        </View>
      ) : null}

      {loading ? <LoadingState label="Cargando datos de tu cuenta…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {data
        ?.filter((group) => !section || group.label === section)
        .map((group) => (
          <ListCard
            key={group.label}
            title={`${group.label} (${group.rows.length})`}
            body={group.error || (!group.rows.length ? 'Sin registros para esta cuenta.' : '')}
            footer={
              <>
                {group.rows.map((row) => {
                  let title = String(row.title || row.subject || row.status || 'Registro');
                  let body = String(row.body || row.description || '');
                  if (group.label === 'Rutas guardadas en mi cuenta') {
                    title = group.routeNames.get(String(row.route_id)) || `Ruta ${String(row.route_id).slice(0, 8)}`;
                    body = row.visited_at ? `Visitada el ${new Date(String(row.visited_at)).toLocaleDateString()}` : 'Pendiente por recorrer';
                  } else if (group.label === 'Lugares visitados') {
                    title = group.placeNames.get(String(row.place_id)) || `Lugar ${String(row.place_id).slice(0, 8)}`;
                    body = `Visita registrada: ${new Date(String(row.visited_at || row.created_at)).toLocaleString()}`;
                  } else if (group.label === 'Canjes de cupones') {
                    title = `Cupón canjeado · Ahorro Bs ${row.savings}`;
                    body = `Canjeado el ${new Date(String(row.redeemed_at || row.created_at)).toLocaleString()}`;
                  } else if (group.label === 'Reservas') {
                    title = `Reserva (${row.status || 'confirmada'})`;
                    body = `${row.participants} participantes · Total Bs ${row.total}`;
                  } else if (group.label === 'Suscripciones') {
                    title = `Suscripción ${row.status}`;
                    body = `Vigente hasta ${new Date(String(row.ends_at)).toLocaleDateString()}`;
                  }

                  return (
                    <ListCard
                      key={row.id}
                      title={title}
                      body={body}
                      onPress={group.label === 'Rutas guardadas en mi cuenta' ? () => router.navigate(`/turista/ruta/${row.route_id}`) : undefined}
                      footer={
                        <View style={styles.btnRow}>
                          {group.label === 'Notificaciones' ? (
                            <>
                              {!row.read_at ? (
                                <Button title="Marcar leída" size="sm" disabled={busy !== null} onPress={() => { void markRead(row.id); }} />
                              ) : null}
                              <Button title="Eliminar" size="sm" variant="soft" disabled={busy !== null} onPress={() => { void removeRecord('notifications', row.id, 'Notificación eliminada.'); }} />
                            </>
                          ) : null}
                          {group.label === 'Rutas guardadas en mi cuenta' ? (
                            <>
                              <Button
                                title={row.visited_at ? 'Marcar pendiente' : 'Marcar visitada'}
                                size="sm"
                                variant="secondary"
                                disabled={busy !== null}
                                onPress={() => { void markSavedVisited(row.id, Boolean(row.visited_at)); }}
                              />
                              <Button
                                title="Quitar"
                                size="sm"
                                variant="soft"
                                disabled={busy !== null}
                                onPress={() => { void removeRecord('saved-routes', row.id, 'Ruta quitada de tu cuenta.'); }}
                              />
                            </>
                          ) : null}
                        </View>
                      }
                    />
                  );
                })}
              </>
            }
          />
        ))}
      {session ? <Button title="Actualizar" variant="secondary" disabled={loading} onPress={retry} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 4,
  },
});
