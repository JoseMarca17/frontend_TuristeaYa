import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { authenticatedRequest } from '@/services/session';
import { endpoints } from '@/services/endpoints';

export default function AccountScreen({ section }: { section?: string } = {}) {
  const session = useSession();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!session) return null;
    const options = { signal, private: true, filters: { user_id: session.user.id } };
    const results = await Promise.allSettled(['notifications', 'reservations', 'subscriptions', 'tickets', 'saved-routes'].map((name) => listRecords(name, options)));
    return results.map((result, index) => ({ label: ['Notificaciones', 'Reservas', 'Suscripciones', 'Reportes', 'Rutas guardadas en mi cuenta'][index],
      rows: result.status === 'fulfilled' ? result.value.filter((row) => row.user_id === session.user.id) : [],
      error: result.status === 'rejected' ? String(result.reason?.message || 'No se pudo consultar este recurso.') : '' }));
  }, [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function markRead(id: string) {
    if (busy) return;
    setBusy(id); setNotice('');
    try { await authenticatedRequest(endpoints.record('notifications', id), { method: 'PATCH', body: { read_at: new Date().toISOString() } }); retry(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.'); }
    finally { setBusy(null); }
  }
  return <Screen title={section || 'Mi cuenta'} subtitle="Datos guardados en TuristeaYa">
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {loading ? <AppText>Cargando…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {data?.filter(group => !section || group.label === section).map((group) => <ListCard key={group.label} title={group.label} body={group.error || (!group.rows.length ? 'Sin registros para esta cuenta.' : '')}
      footer={<>{group.rows.map((row) => <ListCard key={row.id} title={String(row.title || row.subject || row.status || 'Registro')}
        body={String(row.body || row.description || row.route_id || (row.participants != null ? `${row.participants} participantes · Bs ${row.total}` : row.ends_at || ''))}
        footer={group.label === 'Notificaciones' && !row.read_at ? <Button title="Marcar como leída" disabled={busy !== null} onPress={() => markRead(row.id)} /> : undefined} />)}</>} />)}
    {session ? <Button title="Actualizar" disabled={loading} onPress={retry} /> : null}
  </Screen>;
}
