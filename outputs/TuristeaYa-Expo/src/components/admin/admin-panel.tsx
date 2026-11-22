import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { requireRole, updateRecord } from '@/services/management';

const sections = [ ['user-access', 'Usuarios y permisos'], ['business-verifications', 'Validación de negocios'], ['reviews', 'Moderación de reseñas'], ['audit-logs', 'Auditoría'] ];
export function AdminPanel() {
  const session = useSession();
  const [entity, setEntity] = useState('user-access');
  const [pending, setPending] = useState<{ id: string; body: Record<string, unknown>; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const load = useCallback(async (signal: AbortSignal): Promise<CatalogRow[]> => {
    if (!session) throw new Error('Inicia sesión con una cuenta administradora.');
    await requireRole(['admin'], signal);
    const rows = await listRecords(entity, { private: true, signal });
    if (entity !== 'user-access') return rows;
    const profiles = await listRecords('profiles', { private: true, signal });
    return rows.map(row => ({ ...row, display_name: profiles.find(profile => profile.id === row.user_id)?.full_name || 'Cuenta sin nombre' }));
  }, [entity, session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function confirm() {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await updateRecord(entity, pending.id, pending.body); setPending(null); setNotice('Cambio guardado.'); retry(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen title="Administración" subtitle="Acceso exclusivo para administradores">
    {sections.map(([name, label]) => <Button key={name} title={label} disabled={busy} variant={entity === name ? 'primary' : 'secondary'} onPress={() => { setEntity(name); setPending(null); setNotice(''); }} />)}
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {loading ? <AppText>Cargando…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {!loading && !error && !data?.length ? <AppText>No hay registros.</AppText> : null}
    {pending && session ? <ListCard title="Confirmar cambio" body={`${pending.label}\nRegistro: ${pending.id}`} footer={<>
      <Button title={busy ? 'Guardando…' : 'Confirmar'} disabled={busy} onPress={confirm} />
      <Button title="Cancelar" disabled={busy} onPress={() => setPending(null)} />
    </>} /> : null}
    {data?.map(row => <ListCard key={row.id} title={String(row.display_name || row.responsible_name || row.body || row.action || 'Registro')}
      body={String([row.role, row.status, row.rating ? `${row.rating}/5` : '', row.hidden ? 'Oculta' : '', row.review_notes, row.created_at].filter(Boolean).join(' · '))}
      footer={<>
        {entity === 'user-access' && row.user_id !== session?.user.id ? <>
          {['tourist', 'advertiser', 'support', 'admin'].map(role => <Button key={role} title={`Rol: ${role}`} disabled={busy || row.role === role} onPress={() => setPending({ id: row.id, body: { role }, label: `Cambiar rol a ${role}` })} />)}
          {['active', 'suspended', 'blocked'].map(status => <Button key={status} title={`Estado: ${status}`} disabled={busy || row.status === status} onPress={() => setPending({ id: row.id, body: { status }, label: `Cambiar estado a ${status}` })} />)}
        </> : null}
        {entity === 'business-verifications' ? ['approved', 'correction_requested'].map(status => <Button key={status} title={status === 'approved' ? 'Aprobar documentación' : 'Solicitar corrección'} disabled={busy || row.status === status}
          onPress={() => setPending({ id: row.id, body: { status, reviewer_id: session?.user.id, reviewed_at: new Date().toISOString() }, label: `Cambiar verificación a ${status}` })} />) : null}
        {entity === 'reviews' ? <Button title={row.hidden ? 'Restaurar reseña' : 'Ocultar reseña'} disabled={busy} onPress={() => setPending({ id: row.id, body: { hidden: !row.hidden }, label: row.hidden ? 'Restaurar reseña' : 'Ocultar reseña' })} /> : null}
      </>} />)}
    <Button title="Actualizar" disabled={loading || busy} onPress={retry} />
    <Button title="Tickets de soporte" onPress={() => router.navigate('/soporte')} />
  </Screen>;
}
