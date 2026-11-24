import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { validateAndCompressImage, type PreparedImageAsset } from '@/services/image-upload';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { radius, spacing } from '@/theme';

export function TicketConversation({ ticketId, isDemo = false }: { ticketId: string; isDemo?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);

  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [attachment, setAttachment] = useState<PreparedImageAsset | null>(null);
  const [livePolling, setLivePolling] = useState(true);
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

  useEffect(() => {
    if (!livePolling || isDemo || !session) return;
    const timer = setInterval(() => {
      retry();
    }, 5000);
    return () => clearInterval(timer);
  }, [livePolling, isDemo, session, retry]);

  async function pickAttachment() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Permite el acceso a fotos para adjuntar evidencia.', 'error');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    try {
      const prepared = await validateAndCompressImage(res.assets[0], 0, 1);
      setAttachment(prepared);
      showToast('Adjunto preparado (referencia en mensaje; Render no tiene /media/tickets).', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Archivo inválido (Máx. 5 MB).', 'error');
    }
  }

  async function send() {
    if (lock.current || (!body.trim() && !attachment)) return;
    const finalBody = attachment
      ? `${body.trim() || 'Evidencia adjunta'} [Adjunto: ${attachment.fileName || 'captura.jpg'} · ${attachment.compressedLabel || '≤5MB'}]`
      : body.trim();

    if (isDemo) {
      setDemoMessages((prev) => [
        ...prev,
        { id: `demo-msg-${Date.now()}`, sender_id: 'demo-support', body: finalBody, created_at: new Date().toISOString() },
      ]);
      setBody('');
      setAttachment(null);
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
        { ticket_id: ticketId, sender_id: session.user.id, body: finalBody },
        'Enviando mensaje…',
      );
      setBody('');
      setAttachment(null);
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
      <View style={styles.topRow}>
        <Chip
          label={livePolling ? '● Sincronización activa (5s)' : 'Pausado'}
          selected={livePolling}
          onPress={() => setLivePolling((v) => !v)}
        />
        <Badge label={loading ? 'Actualizando…' : `${data?.length ?? 0} mensajes`} tone="cream" />
      </View>

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
      {attachment ? (
        <View style={styles.attachRow}>
          <Image source={{ uri: attachment.uri }} style={styles.thumb} accessibilityLabel="Evidencia adjunta" />
          <AppText variant="caption" style={{ flex: 1 }}>{attachment.fileName || 'Captura'}</AppText>
          <Button title="Quitar" size="sm" variant="soft" onPress={() => setAttachment(null)} />
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title={busy ? 'Enviando…' : 'Enviar mensaje'} disabled={busy || (!body.trim() && !attachment)} onPress={send} />
        </View>
        <Button title="Adjuntar foto" variant="secondary" size="sm" disabled={busy} onPress={() => { void pickAttachment(); }} />
      </View>
      <Button title="Actualizar conversación" variant="soft" size="sm" disabled={loading} onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: 4, alignItems: 'center' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  thumb: { width: 42, height: 42, borderRadius: radius.sm },
});
