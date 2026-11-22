import { useCallback, useRef, useState } from 'react';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { useSession } from '@/hooks/use-session';

export function TicketConversation({ ticketId }: { ticketId: string }) {
  const session = useSession();
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback((signal: AbortSignal) => session ? listRecords('ticket-messages', {
    private: true, signal, filters: { ticket_id: ticketId },
  }) : Promise.resolve([]), [ticketId, session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function send() {
    if (lock.current || !body.trim() || !session) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      await createRecord('ticket-messages', { ticket_id: ticketId, sender_id: session.user.id, body: body.trim() });
      setBody(''); retry();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo enviar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    {loading ? <AppText>Cargando conversación…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {data?.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(row =>
      <ListCard key={row.id} title={`${row.sender_id === session?.user.id ? 'Tú' : 'Respuesta'} · ${new Date(String(row.created_at)).toLocaleString()}`} body={String(row.body)} />)}
    <FormField label="Mensaje" value={body} onChangeText={setBody} editable={!busy} maxLength={4000} multiline />
    <Button title={busy ? 'Enviando…' : 'Enviar mensaje'} disabled={busy || !body.trim()} onPress={send} />
    <Button title="Actualizar conversación" disabled={loading} onPress={retry} />
  </>;
}
