import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pantalla, TABS_NEGOCIO } from './Ui';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { updateRecord, createRecord } from '@/services/management';

type Mode = 'summary' | 'data' | 'promotions' | 'campaigns' | 'reviews' | 'notifications' | 'verification';
type Field = [string, string, 'text' | 'number' | 'date'];
const fields: Record<string, Field[]> = {
  data: [['name', 'Nombre', 'text'], ['contact_email', 'Correo', 'text'], ['phone', 'Teléfono', 'text']],
  promotions: [['title', 'Título', 'text'], ['code', 'Código', 'text'], ['discount_percent', 'Descuento (%)', 'number'], ['conditions', 'Condiciones', 'text'], ['starts_at', 'Inicio (AAAA-MM-DDTHH:mm)', 'date'], ['ends_at', 'Fin (AAAA-MM-DDTHH:mm)', 'date'], ['max_redemptions', 'Límite total', 'number'], ['per_user_limit', 'Límite por usuario', 'number']],
  campaigns: [['title', 'Título', 'text'], ['ad_text', 'Texto del anuncio', 'text'], ['budget', 'Presupuesto (Bs)', 'number'], ['starts_at', 'Inicio (AAAA-MM-DDTHH:mm)', 'date'], ['ends_at', 'Fin (AAAA-MM-DDTHH:mm)', 'date'], ['radius_meters', 'Radio (metros)', 'number']],
  verification: [['responsible_name', 'Nombre del responsable', 'text'], ['contact_email', 'Correo de contacto', 'text'], ['document_path', 'Ruta del documento almacenado', 'text']],
};
const titles: Record<Mode, string> = { summary: 'Mi negocio', data: 'Datos del negocio', promotions: 'Promociones', campaigns: 'Mis campañas', reviews: 'Reseñas y respuestas', notifications: 'Notificaciones', verification: 'Verificar establecimiento' };
const entities: Record<string, string> = { data: 'businesses', promotions: 'promotions', campaigns: 'campaigns', verification: 'business-verifications' };

function BusinessEditor({ mode, row, businessId, places, onSaved }: { mode: string; row?: CatalogRow; businessId: string; places: CatalogRow[]; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((fields[mode] || []).map(([key]) => [key, String(row?.[key] ?? '')])));
  const [placeId, setPlaceId] = useState(String(row?.place_id || places[0]?.id || ''));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, label, type] of fields[mode]) {
        const value = values[key].trim();
        if (!value && !['phone', 'contact_email'].includes(key)) throw new Error(`Completa ${label}.`);
        if (type === 'number') {
          const number = Number(value.replace(',', '.'));
          if (!value || !Number.isFinite(number) || number <= 0) throw new Error(`${label} debe ser mayor que cero.`);
          payload[key] = number;
        } else if (type === 'date') {
          if (!Number.isFinite(Date.parse(value))) throw new Error(`Fecha inválida: ${label}.`);
          payload[key] = new Date(value).toISOString();
        } else payload[key] = value || null;
      }
      if (payload.ends_at && String(payload.ends_at) <= String(payload.starts_at)) throw new Error('La fecha final debe ser posterior al inicio.');
      if (mode === 'promotions') {
        if (!placeId) throw new Error('El negocio necesita un lugar asociado para crear promociones.');
        payload.place_id = placeId;
      }
      if (row) await updateRecord(entities[mode], row.id, payload);
      else await createRecord(entities[mode], { ...payload, business_id: businessId, ...(mode === 'campaigns' ? { placement: 'home' } : {}) });
      onSaved();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    {fields[mode]?.map(([key, label, type]) => <FormField key={key} label={label} value={values[key]} editable={!busy} keyboardType={type === 'number' ? 'decimal-pad' : 'default'} onChangeText={value => setValues(old => ({ ...old, [key]: value }))} />)}
    {mode === 'promotions' ? places.map(place => <Button key={place.id} title={`${placeId === place.id ? '✓ ' : ''}${place.name}`} disabled={busy} onPress={() => setPlaceId(place.id)} />) : null}
    {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
    <Button title={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={save} />
  </>;
}

export function BusinessPanel({ mode }: { mode: Mode }) {
  const session = useSession();
  const [businessId, setBusinessId] = useState('');
  const [edit, setEdit] = useState<CatalogRow | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!session) throw new Error('Inicia sesión para ver tus negocios.');
    const businesses = (await listRecords('businesses', { private: true, signal, filters: { owner_id: session.user.id } })).filter(row => row.owner_id === session.user.id);
    const business = businesses.find(row => row.id === businessId) || businesses[0];
    if (!business) return { businesses, business, places: [], rows: [] };
    const places = await listRecords('places', { signal, filters: { business_id: business.id } });
    let rows: CatalogRow[] = [];
    if (['promotions', 'campaigns', 'verification'].includes(mode)) rows = await listRecords(entities[mode], { private: true, signal, filters: { business_id: business.id } });
    if (mode === 'notifications') rows = await listRecords('notifications', { private: true, signal, filters: { user_id: session.user.id } });
    if (mode === 'reviews') rows = (await listRecords('reviews', { signal })).filter(row => places.some(place => place.id === row.place_id));
    return { businesses, business, places, rows };
  }, [session, businessId, mode]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function change(row: CatalogRow, status: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await updateRecord(entities[mode], row.id, { status }); retry(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Pantalla titulo={titles[mode]} subtitulo="Datos de tus establecimientos" tabs={TABS_NEGOCIO} activa={mode === 'summary' ? 'Resumen' : mode === 'campaigns' ? 'Campañas' : mode === 'data' ? 'Mi local' : 'Cupones'}>
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {loading ? <AppText>Cargando…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {!loading && !error && !data?.business ? <AppText>Tu cuenta no tiene negocios asociados.</AppText> : null}
    {data?.businesses.map(business => <Button key={business.id} title={String(business.name)} onPress={() => { setBusinessId(business.id); setEdit(null); }} />)}
    {data?.business ? <>
      {mode === 'summary' ? <>
        <ListCard title={String(data.business.name)} body={`${data.places.length} lugares asociados`} />
        <Button title="Promociones" onPress={() => router.navigate('/RamaNegocio/promociones')} />
        <Button title="Reseñas y respuestas" onPress={() => router.navigate('/RamaNegocio/resenas')} />
        <Button title="Solicitar verificación" onPress={() => router.navigate('/RamaNegocio/verificar')} />
        <Button title="Ayuda" onPress={() => router.navigate('/RamaNegocio/ayuda')} />
      </> : null}
      {mode === 'data' ? <BusinessEditor key={`${session?.user.id}-${data.business.id}`} mode="data" row={data.business} businessId={data.business.id} places={data.places} onSaved={() => { setNotice('Datos guardados.'); retry(); }} /> : null}
      {['promotions', 'campaigns', 'verification'].includes(mode) ? <Button title="Crear registro" onPress={() => setEdit('new')} /> : null}
      {edit && fields[mode] ? <BusinessEditor key={`${session?.user.id}-${data.business.id}-${edit === 'new' ? 'new' : edit.id}`} mode={mode} row={edit === 'new' ? undefined : edit} businessId={data.business.id} places={data.places} onSaved={() => { setEdit(null); setNotice('Guardado.'); retry(); }} /> : null}
      {data.rows.map(row => <ListCard key={row.id} title={String(row.title || row.responsible_name || row.body || 'Registro')} body={String(row.status || row.description || row.review_notes || '')} footer={<>
        {['promotions', 'campaigns'].includes(mode) ? <>
          <Button title="Editar" disabled={busy} onPress={() => setEdit(row)} />
          <Button title={row.status === 'active' ? 'Pausar' : 'Activar'} disabled={busy} onPress={() => change(row, row.status === 'active' ? 'paused' : 'active')} />
        </> : null}
        {mode === 'reviews' ? <ReviewReply review={row} businessId={data.business.id} /> : null}
      </>} />)}
      {!data.rows.length && !['summary', 'data'].includes(mode) ? <AppText>Sin registros.</AppText> : null}
    </> : null}
    <Button title="Actualizar" disabled={loading || busy} onPress={retry} />
  </Pantalla>;
}

function ReviewReply({ review, businessId }: { review: CatalogRow; businessId: string }) {
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function send() {
    if (lock.current || !body.trim()) return;
    lock.current = true; setBusy(true);
    try { await createRecord('review-replies', { business_id: businessId, review_id: review.id, body: body.trim() }); setBody(''); setNotice('Respuesta publicada.'); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo responder.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <><FormField label="Respuesta del negocio" value={body} onChangeText={setBody} editable={!busy} /><Button title="Publicar respuesta" disabled={busy || !body.trim()} onPress={send} />{notice ? <AppText>{notice}</AppText> : null}</>;
}
