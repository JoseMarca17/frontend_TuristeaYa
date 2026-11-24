import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { spacing } from '@/theme';

export function TicketConversation({ ticketId, isDemo = false }: { ticketId: string; isDemo?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);

  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [demoMessages, setDemoMessages] = useState<CatalogRow[]>([
    { id: 'demo-msg-1', sender_id: 'demo-tourist', body: 'El local no reconoce mi cupón.', created_at: new Date().toISOString() },
  ]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(
    (signal: AbortSignal) => {
      if (isDemo) return Promise.resolve(demoMessages);
      return session
        ? listRecords('ticket-messages', { private: true, signal, filters: { ticket_id: ticketId } })
        : Promise.resolve([]);
    },
    [ticketId, session, isDemo, demoMessages],
  );
  const { data, loading, error, retry } = useRemoteData(load);

  async function send() {
    if (lock.current || !body.trim()) return;
    if (isDemo) {
      setDemoMessages((prev) => [
        ...prev,
        { id: `demo-msg-${Date.now()}`, sender_id: 'demo-support', body: body.trim(), created_at: new Date().toISOString() },
      ]);
      setBody('');
      showToast('Mensaje enviado (Vista Demo).', 'info');
      return;
    }
    if (!session) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await createRecord(
        'ticket-messages',
        { ticket_id: ticketId, sender_id: session.user.id, body: body.trim() },
        'Enviando mensaje…',
      );
      setBody('');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(msgId: string) {
    if (lock.current || !editBody.trim()) return;
    if (isDemo) {
      setDemoMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, body: editBody.trim() } : m)));
      setEditingId(null);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await updateRecord('ticket-messages', msgId, { body: editBody.trim() }, 'Actualizando mensaje…');
      setEditingId(null);
      showToast('Mensaje editado.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo editar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeMsg(msgId: string) {
    if (lock.current) return;
    if (isDemo) {
      setDemoMessages((prev) => prev.filter((m) => m.id !== msgId));
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('ticket-messages', msgId, 'Eliminando mensaje…');
      showToast('Mensaje eliminado.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing.xs + 2 }}>
      {loading ? <AppText variant="caption">Cargando conversación…</AppText> : null}
      {error || notice ? <AppText accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error || notice}</AppText> : null}
      {data
        ?.slice()
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((row) => {
          const isMine = session ? row.sender_id === session.user.id : row.sender_id === 'demo-support';
          return (
            <ListCard
              key={row.id}
              title={`${isMine ? 'Tú' : 'Usuario'} · ${new Date(String(row.created_at)).toLocaleString()}`}
              body={String(row.body)}
              footer={
                isMine ? (
                  editingId === row.id ? (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      <FormField label="Editar mensaje" value={editBody} onChangeText={setEditBody} />
                      <View style={styles.row}>
                        <Button title="Guardar" size="sm" disabled={busy} onPress={() => { void saveEdit(row.id); }} />
                        <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setEditingId(null)} />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.row}>
                      <Button title="Editar" size="sm" variant="secondary" onPress={() => { setEditingId(row.id); setEditBody(String(row.body)); }} />
                      <Button title="Eliminar" size="sm" variant="soft" onPress={() => { void removeMsg(row.id); }} />
                    </View>
                  )
                ) : undefined
              }
            />
          );
        })}
      <FormField label="Mensaje" value={body} onChangeText={setBody} editable={!busy} maxLength={4000} multiline />
      <Button title={busy ? 'Enviando…' : 'Enviar mensaje'} disabled={busy || !body.trim()} onPress={send} />
      <Button title="Actualizar conversación" variant="secondary" size="sm" disabled={loading} onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: 4 },
});
