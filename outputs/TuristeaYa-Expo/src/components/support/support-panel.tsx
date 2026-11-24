import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import {
  buildCouponNotificationMetadata,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
} from '@/services/domain-rules';
import { createRecord, deleteRecord, requireRole, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useCouponStore } from '@/stores/use-coupon-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';
import { TicketConversation } from './ticket-conversation';

const statusLabels: Record<string, string> = {
  all: 'Todos',
  open: 'Abierto',
  pending: 'Pendiente',
  in_progress: 'En proceso',
  waiting_user: 'Esperando usuario',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const kindLabels: Record<string, string> = {
  all: 'Todos los tipos',
  coupon: 'Disputas cupones',
  review: 'Reportes reseñas',
  other: 'Generales / Lugares',
  route: 'Rutas',
  account: 'Cuenta / VIP',
};

export function SupportPanel() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && (demoRole === 'support' || demoRole === 'admin');
  const showToast = useUiStore((s) => s.showToast);

  const demoTickets = useDemoStore((s) => s.tickets);
  const demoRoutes = useDemoStore((s) => s.routes);
  const demoReservations = useDemoStore((s) => s.reservations);
  const updateDemoTicket = useDemoStore((s) => s.updateTicket);
  const deleteDemoTicket = useDemoStore((s) => s.deleteTicket);
  const addDemoNotification = useDemoStore((s) => s.addNotification);
  const demoRedemptions = useCouponStore((s) => s.redemptions);

  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [notifyText, setNotifyText] = useState('');
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);
  const [userHistory, setUserHistory] = useState<{
    name: string;
    tickets: number;
    redemptions: number;
    reservations: number;
    routes: number;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async (signal: AbortSignal) => {
    if (isDemo) {
      return { tickets: demoTickets, audits: [] as CatalogRow[] };
    }
    if (!session) throw new Error('Inicia sesión con una cuenta de soporte o administrador.');
    await requireRole(['admin', 'support'], signal);
    const [tickets, audits] = await Promise.all([
      listRecords('tickets', { private: true, signal }),
      listRecords('audit-logs', { private: true, signal }).catch(() => []),
    ]);
    return { tickets, audits };
  }, [session, isDemo, demoTickets]);

  const { data, loading, error, retry } = useRemoteData(load);

  async function patchTicket(id: string, body: Record<string, unknown>, successMsg: string) {
    if (isDemo) {
      updateDemoTicket(id, body);
      showToast(successMsg, 'success');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await updateRecord('tickets', id, body, 'Actualizando ticket…');
      showToast(successMsg, 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadUserHistory(userId: string) {
    if (historyUserId === userId) {
      setHistoryUserId(null);
      setUserHistory(null);
      return;
    }
    if (isDemo) {
      setHistoryUserId(userId);
      setUserHistory({
        name: 'Historial de usuario demo',
        tickets: demoTickets.filter((t) => t.user_id === userId).length,
        redemptions: demoRedemptions.length,
        reservations: demoReservations.length,
        routes: demoRoutes.length,
      });
      return;
    }
    setBusy(true);
    try {
      const [profiles, tks, reds, resv, rts] = await Promise.all([
        listRecords('profiles', { private: true }).catch(() => []),
        listRecords('tickets', { private: true, filters: { user_id: userId } }).catch(() => []),
        listRecords('coupon-redemptions', { private: true, filters: { user_id: userId } }).catch(() => []),
        listRecords('reservations', { private: true, filters: { user_id: userId } }).catch(() => []),
        listRecords('routes', { private: true, filters: { user_id: userId } }).catch(() => []),
      ]);
      const prof = profiles.find((p) => p.id === userId);
      setHistoryUserId(userId);
      setUserHistory({
        name: String(prof?.full_name || userId.slice(0, 8)),
        tickets: tks.filter((x) => x.user_id === userId).length,
        redemptions: reds.filter((x) => x.user_id === userId).length,
        reservations: resv.filter((x) => x.user_id === userId).length,
        routes: rts.filter((x) => x.user_id === userId).length,
      });
    } finally {
      setBusy(false);
    }
  }

  async function resolveCouponDispute(ticket: CatalogRow, approved: boolean) {
    const status = 'resolved';
    const meta = buildCouponNotificationMetadata({
      redemption_id: ticket.redemption_id ? String(ticket.redemption_id) : null,
      error_code: approved ? null : 'DISPUTE_REJECTED',
      error_reason: approved ? 'Disputa aprobada por Soporte' : 'Disputa rechazada por Soporte',
      severity: approved ? 'info' : 'warning',
    });
    if (isDemo) {
      updateDemoTicket(ticket.id, { status });
      addDemoNotification({
        id: `demo-notif-${Date.now()}`,
        user_id: String(ticket.user_id || 'demo-tourist'),
        ticket_id: ticket.id,
        title: approved ? 'Disputa de cupón aprobada' : 'Resolución de disputa de cupón',
        body: approved ? 'Soporte validó tu canje.' : 'Tu disputa fue cerrada sin ajuste.',
        read_at: null,
        created_at: new Date().toISOString(),
      });
      showToast('Disputa resuelta y notificada.', 'success');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await updateRecord('tickets', ticket.id, { status }, 'Resolviendo disputa de cupón…');
      await createRecord('notifications', {
        user_id: ticket.user_id,
        ticket_id: ticket.id,
        title: approved ? 'Disputa de cupón aprobada' : 'Resolución de disputa de cupón',
        body: `${approved ? 'Soporte validó tu canje.' : 'Tu disputa fue cerrada sin ajuste.'} ${JSON.stringify(meta)}`,
      }).catch(() => { });
      showToast('Disputa resuelta y notificada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo resolver la disputa.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeTicket(id: string) {
    const ok = await confirmAction({
      title: 'Eliminar ticket',
      message: '¿Eliminar este ticket de soporte permanentemente?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    if (isDemo) {
      deleteDemoTicket(id);
      showToast('Ticket eliminado.', 'info');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('tickets', id, 'Eliminando ticket…');
      showToast('Ticket eliminado.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function sendUserNotification(ticket: CatalogRow) {
    if (!notifyText.trim()) return;
    if (isDemo) {
      addDemoNotification({
        id: `demo-notif-${Date.now()}`,
        user_id: String(ticket.user_id || 'demo-tourist'),
        ticket_id: ticket.id,
        title: `Actualización sobre: ${ticket.subject}`,
        body: notifyText.trim(),
        read_at: null,
        created_at: new Date().toISOString(),
      });
      setNotifyText('');
      showToast('Aviso enviado al usuario.', 'success');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await createRecord(
        'notifications',
        {
          user_id: ticket.user_id,
          ticket_id: ticket.id,
          title: `Actualización sobre: ${ticket.subject}`,
          body: notifyText.trim(),
        },
        'Enviando aviso al usuario…',
      );
      setNotifyText('');
      showToast('Aviso enviado al usuario.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo notificar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const tickets = isDemo ? demoTickets : data?.tickets ?? [];
  const filtered = tickets.filter((t) => {
    const statusOk = statusFilter === 'all' || t.status === statusFilter;
    const rawKind = String(t.kind || 'other');
    const kindOk = kindFilter === 'all' || rawKind === kindFilter || (kindFilter === 'coupon' && rawKind === 'coupon_dispute');
    return statusOk && kindOk;
  });

  return (
    <Screen title="Tickets de soporte" subtitle="Atención, disputas de cupones y seguimiento">
      <RoleBanner />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {Object.entries(kindLabels).map(([key, label]) => (
          <Chip key={key} label={label} selected={kindFilter === key} onPress={() => setKindFilter(key)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(['all', ...TICKET_STATUS_OPTIONS] as const).map((key) => (
          <Chip key={key} label={statusLabels[key] || key} selected={statusFilter === key} onPress={() => setStatusFilter(key)} />
        ))}
      </ScrollView>

      {!session && !isDemo ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
      {loading ? <LoadingState label="Cargando casos de soporte…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert" style={{ color: '#b91c1c' }}>{notice}</AppText> : null}
      {!loading && !error && !filtered.length ? <AppText>No hay casos con los filtros actuales.</AppText> : null}

      {filtered.map((ticket) => {
        const isDispute = ticket.kind === 'coupon' || ticket.kind === 'coupon_dispute' || Boolean(ticket.redemption_id);
        return (
          <ListCard
            key={ticket.id}
            title={String(ticket.subject)}
            body={`${statusLabels[String(ticket.status)] || ticket.status} · Prioridad: ${ticket.priority}\n${ticket.description || ''}`}
            footer={
              <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
                <View style={styles.chipRow}>
                  <Badge label={statusLabels[String(ticket.status)] || String(ticket.status)} tone={ticket.status === 'resolved' ? 'green' : 'cream'} />
                  {isDispute ? <Badge label="Disputa de cupón" tone="cream" /> : null}
                </View>

                <View style={styles.chipRow}>
                  <Button
                    title={selected === ticket.id ? 'Cerrar caso' : 'Gestionar caso'}
                    size="sm"
                    onPress={() => setSelected(selected === ticket.id ? null : ticket.id)}
                  />
                  {ticket.user_id ? (
                    <Button
                      title={historyUserId === ticket.user_id ? 'Ocultar historial' : 'Historial'}
                      size="sm"
                      variant="secondary"
                      onPress={() => { void loadUserHistory(String(ticket.user_id)); }}
                    />
                  ) : null}
                </View>

                {historyUserId === ticket.user_id && userHistory ? (
                  <View style={styles.historyCard}>
                    <AppText variant="label" color="primary">{userHistory.name}</AppText>
                    <AppText variant="caption">
                      Tickets: {userHistory.tickets} · Canjes: {userHistory.redemptions} · Reservas: {userHistory.reservations} · Rutas: {userHistory.routes}
                    </AppText>
                  </View>
                ) : null}

                {selected === ticket.id ? (
                  <View style={styles.detailBox}>
                    <TicketConversation key={`${session?.user.id || 'demo'}-${ticket.id}`} ticketId={ticket.id} isDemo={isDemo} />

                    {isDispute ? (
                      <View style={styles.disputeBox}>
                        <AppText variant="label" color="primary">Resolución de disputa</AppText>
                        <View style={styles.chipRow}>
                          <Button title="Aprobar disputa" size="sm" disabled={busy} onPress={() => { void resolveCouponDispute(ticket, true); }} />
                          <Button title="Rechazar disputa" size="sm" variant="secondary" disabled={busy} onPress={() => { void resolveCouponDispute(ticket, false); }} />
                        </View>
                      </View>
                    ) : null}

                    <AppText variant="label">Estado del caso</AppText>
                    <View style={styles.chipRow}>
                      {TICKET_STATUS_OPTIONS.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={ticket.status === status ? 'primary' : 'secondary'}
                          title={statusLabels[status] || status}
                          disabled={busy || ticket.status === status}
                          onPress={() => { void patchTicket(ticket.id, { status }, `Ticket actualizado a ${statusLabels[status]}.`); }}
                        />
                      ))}
                    </View>

                    <AppText variant="label">Prioridad y asignación</AppText>
                    <View style={styles.chipRow}>
                      {TICKET_PRIORITY_OPTIONS.map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant="secondary"
                          title={p}
                          disabled={busy || ticket.priority === p}
                          onPress={() => { void patchTicket(ticket.id, { priority: p }, `Prioridad cambiada a ${p}.`); }}
                        />
                      ))}
                      {session || isDemo ? (
                        <Button
                          size="sm"
                          variant="soft"
                          title={ticket.assigned_to === (session?.user.id || 'demo-support') ? 'Asignado a mí' : 'Asignarme caso'}
                          disabled={busy || ticket.assigned_to === (session?.user.id || 'demo-support')}
                          onPress={() => { void patchTicket(ticket.id, { assigned_to: session?.user.id || 'demo-support' }, 'Caso asignado.'); }}
                        />
                      ) : null}
                    </View>

                    <FormField
                      label="Enviar aviso al usuario"
                      value={notifyText}
                      onChangeText={setNotifyText}
                      placeholder="Ej. Ya revisamos tu caso con el comercio."
                    />
                    <Button
                      title="Enviar aviso"
                      size="sm"
                      variant="secondary"
                      disabled={busy || !notifyText.trim()}
                      onPress={() => { void sendUserNotification(ticket); }}
                    />

                    {(data?.audits || []).length > 0 ? (
                      <AppText variant="micro" color="inkSoft">
                        Auditoría reciente: {data?.audits.slice(0, 3).map((a) => String(a.action || a.id)).join(' · ')}
                      </AppText>
                    ) : null}

                    <Button title="Eliminar caso" size="sm" variant="soft" disabled={busy} onPress={() => { void removeTicket(ticket.id); }} />
                  </View>
                ) : null}
              </View>
            }
          />
        );
      })}

      <Button title="Actualizar casos" variant="secondary" disabled={loading || busy} onPress={retry} />
      <Button title="Volver al inicio" variant="soft" onPress={() => router.replace('/turista')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, paddingBottom: 2 },
  historyCard: {
    backgroundColor: colors.surfaceGreenSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  disputeBox: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailBox: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
});
