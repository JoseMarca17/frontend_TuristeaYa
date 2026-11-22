import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { TicketConversation } from './ticket-conversation';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useSession } from '@/hooks/use-session';
import { listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';

export function MyReports({ create = false }: { create?: boolean }) {
  const session = useSession();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const load = useCallback((signal: AbortSignal) => session ? listRecords('tickets', { private: true, signal, filters: { user_id: session.user.id } }) : Promise.resolve([]), [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function submit() {
    if (!session || lock.current || !subject.trim() || !description.trim()) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      await createRecord('tickets', { user_id: session.user.id, subject: subject.trim(), description: description.trim(), kind: 'other' });
      setSubject(''); setDescription(''); setNotice('Reporte enviado.'); retry();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo enviar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen title={create ? 'Reportar un problema' : 'Ayuda y mis reportes'} subtitle="Seguimiento de tus consultas">
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {session && create ? <>
      <FormField label="Asunto" value={subject} onChangeText={setSubject} maxLength={160} editable={!busy} />
      <FormField label="Descripción" value={description} onChangeText={setDescription} maxLength={4000} editable={!busy} multiline />
      <Button title="Enviar reporte" disabled={busy || !subject.trim() || !description.trim()} onPress={submit} />
    </> : <Button title="Nuevo reporte" onPress={() => router.navigate('/RamaNegocio/reportar')} />}
    {loading ? <AppText>Cargando…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {data?.filter(row => row.user_id === session?.user.id).map(row => <ListCard key={row.id} title={String(row.subject)} body={String(row.status)} footer={<>
      <Button title="Ver conversación" onPress={() => setSelected(selected === row.id ? null : row.id)} />
      {selected === row.id ? <TicketConversation key={`${session?.user.id}-${row.id}`} ticketId={row.id} /> : null}
    </>} />)}
    <Button title="Actualizar" disabled={loading} onPress={retry} />
  </Screen>;
}
