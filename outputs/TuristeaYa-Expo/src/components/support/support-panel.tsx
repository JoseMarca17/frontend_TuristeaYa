import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { createRecord, deleteRecord, requireRole, updateRecord } from '@/services/management';
import { tickets as demoTickets } from '@/services/mock/support';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, spacing } from '@/theme';
import { TicketConversation } from './ticket-conversation';

const statusLabels: Record<string, string> = {
  all: 'Todos',
  pending: 'Pendiente',
  in_progress: 'En atención',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

export function SupportPanel() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [notifyText, setNotifyText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const isDemo = !session && (demoRole === 'support' || demoRole === 'admin');

  const load = useCallback(async (signal: AbortSignal): Promise<CatalogRow[]> => {
    if (isDemo) {
      return demoTickets.map((t) => ({
        id: t.id,
        user_id: 'demo-tourist',
        subject: t.subject,
        description: t.verification,
        status: t.status === 'Pendiente' ? 'pending' : t.status === 'En curso' ? 'in_progress' : 'resolved',
        priority: t.priority === 'Alta' ? 'high' : t.priority === 'Media' ? 'medium' : 'low',
      }));
    }
    if (!session) throw new Error('Inicia sesión con una cuenta de soporte o administrador.');
    await requireRole(['admin', 'support'], signal);
    return listRecords('tickets', { private: true, signal });
  }, [session, isDemo]);

  const { data, loading, error, retry } = useRemoteData(load);

  async function patchTicket(id: string, body: Record<string, unknown>, successMsg: string) {
    if (isDemo) {
      showToast(`${successMsg} (Vista Demo)`, 'info');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await updateRecord('tickets', id, body, 'Actualizando ticket en Render…');
      showToast(successMsg, 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeTicket(id: string) {
    if (isDemo) {
      setConfirmDeleteId(null);
      showToast('Eliminación simulada en Vista Demo.', 'info');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('tickets', id, 'Eliminando ticket…');
      setConfirmDeleteId(null);
      showToast('Ticket eliminado de Render.', 'success');
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
      setNotifyText('');
      showToast('Notificación enviada (Vista Demo).', 'info');
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
          kind: 'support',
        },
        'Enviando notificación al usuario…',
      );
      setNotifyText('');
      showToast('Notificación enviada al usuario.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo notificar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const filtered = (data ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter);

  return (
    <Screen title="Tickets de soporte" subtitle="Atención, seguimiento y respuestas en Render">
      <RoleBanner />

      <View style={styles.chipRow}>
        {(['all', 'pending', 'in_progress', 'resolved', 'closed'] as const).map((key) => (
          <Chip key={key} label={statusLabels[key]} selected={statusFilter === key} onPress={() => setStatusFilter(key)} />
        ))}
      </View>

      {!session && !isDemo ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
      {loading ? <LoadingState label="Cargando casos de soporte…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert" style={{ color: '#b91c1c' }}>{notice}</AppText> : null}
      {!loading && !error && !filtered.length ? <AppText>No hay casos en este estado.</AppText> : null}

      {filtered.map((ticket) => (
        <ListCard
          key={ticket.id}
          title={String(ticket.subject)}
          body={`${ticket.status} · ${ticket.priority}\n${ticket.description || ''}`}
          footer={
            <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
              <View style={styles.chipRow}>
                <Badge label={`Estado: ${ticket.status}`} tone={ticket.status === 'resolved' ? 'green' : 'cream'} />
                <Badge label={`Prioridad: ${ticket.priority}`} tone="green" />
              </View>
              <Button
                title={selected === ticket.id ? 'Cerrar conversación' : 'Ver conversación'}
                onPress={() => setSelected(selected === ticket.id ? null : ticket.id)}
              />
              {selected === ticket.id ? (
                <View style={styles.detailBox}>
                  <TicketConversation key={`${session?.user.id || 'demo'}-${ticket.id}`} ticketId={ticket.id} isDemo={isDemo} />

                  <AppText variant="label">Cambiar estado (PATCH)</AppText>
                  <View style={styles.chipRow}>
                    {['pending', 'in_progress', 'resolved'].map((status, index) => (
                      <Button
                        key={status}
                        size="sm"
                        title={['Dejar pendiente', 'Marcar en atención', 'Resolver caso'][index]}
                        disabled={busy || ticket.status === status}
                        onPress={() => { void patchTicket(ticket.id, { status }, `Ticket actualizado a ${status}.`); }}
                      />
                    ))}
                  </View>

                  <AppText variant="label">Prioridad y asignación</AppText>
                  <View style={styles.chipRow}>
                    {(['low', 'medium', 'high'] as const).map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant="secondary"
                        title={`Prioridad: ${p}`}
                        disabled={busy || ticket.priority === p}
                        onPress={() => { void patchTicket(ticket.id, { priority: p }, `Prioridad cambiada a ${p}.`); }}
                      />
                    ))}
                    {session ? (
                      <Button
                        size="sm"
                        variant="soft"
                        title="Asignarme caso"
                        disabled={busy || ticket.assigned_to === session.user.id}
                        onPress={() => { void patchTicket(ticket.id, { assigned_to: session.user.id }, 'Caso asignado a tu usuario.'); }}
                      />
                    ) : null}
                  </View>

                  <FormField
                    label="Notificar al usuario (POST /notifications)"
                    value={notifyText}
                    onChangeText={setNotifyText}
                    placeholder="Ej. Ya revisamos tu caso."
                  />
                  <Button
                    title="Enviar notificación"
                    size="sm"
                    variant="secondary"
                    disabled={busy || !notifyText.trim()}
                    onPress={() => { void sendUserNotification(ticket); }}
                  />

                  {confirmDeleteId === ticket.id ? (
                    <View style={styles.chipRow}>
                      <Button title="Confirmar eliminar" size="sm" disabled={busy} onPress={() => { void removeTicket(ticket.id); }} />
                      <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
                    </View>
                  ) : (
                    <Button title="Eliminar ticket (DELETE)" size="sm" variant="soft" disabled={busy} onPress={() => setConfirmDeleteId(ticket.id)} />
                  )}
                </View>
              ) : null}
            </View>
          }
        />
      ))}

      <Button title="Actualizar casos" variant="secondary" disabled={loading || busy} onPress={retry} />
      <Button title="Volver a inicio turista" variant="soft" onPress={() => router.replace('/turista')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  detailBox: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
});
