import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { TicketConversation } from './ticket-conversation';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useSession } from '@/hooks/use-session';
import { listRecords } from '@/services/catalog';
import { requireRole, updateRecord } from '@/services/management';

export function SupportPanel() {
  const session = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!session) throw new Error('Inicia sesión para abrir este panel.');
    await requireRole(['admin', 'support'], signal);
    return listRecords('tickets', { private: true, signal });
  }, [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function changeStatus(id: string, status: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await updateRecord('tickets', id, { status }); retry(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen title="Tickets de soporte" subtitle="Casos registrados en TuristeaYa">
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {loading ? <AppText>Cargando casos…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {!loading && !error && !data?.length ? <AppText>No hay casos registrados.</AppText> : null}
    {data?.map(ticket => <ListCard key={ticket.id} title={String(ticket.subject)} body={`${ticket.status} · ${ticket.priority}\n${ticket.description || ''}`}
      footer={<>
        <Button title={selected === ticket.id ? 'Cerrar conversación' : 'Ver conversación'} onPress={() => setSelected(selected === ticket.id ? null : ticket.id)} />
        {selected === ticket.id ? <>
          <TicketConversation key={`${session?.user.id}-${ticket.id}`} ticketId={ticket.id} />
          {['pending', 'in_progress', 'resolved'].map((status, index) => <Button key={status}
            title={['Dejar pendiente', 'Marcar en atención', 'Resolver caso'][index]} disabled={busy || ticket.status === status}
            onPress={() => changeStatus(ticket.id, status)} />)}
        </> : null}
      </>} />)}
    <Button title="Actualizar casos" disabled={loading || busy} onPress={retry} />
    <Button title="Volver" onPress={() => router.replace('/turista')} />
  </Screen>;
}
