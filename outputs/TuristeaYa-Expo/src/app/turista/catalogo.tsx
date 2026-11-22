import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { PlacePhoto } from '@/components/place-photo';
import { createRecord } from '@/services/management';
import { Linking } from 'react-native';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { useSession } from '@/hooks/use-session';

const text = (value: unknown) => value == null ? '' : String(value);
function mapUrl(place: CatalogRow) {
  if (place.latitude == null || place.longitude == null) return null;
  const lat = Number(place.latitude), lng = Number(place.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;
}
export default function CatalogScreen() {
  const session = useSession();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'places' | 'routes'>('places');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const [places, routes] = await Promise.all([listRecords('places', { signal }), listRecords('routes', { signal })]);
    return { places: places.filter((row) => row.published === true), routes: routes.filter((row) => row.visibility === 'public' || row.user_id === session?.user.id) };
  }, [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  const loadStops = useCallback((signal: AbortSignal) => selected ? listRecords('route-stops', { signal, filters: { route_id: selected } }) : Promise.resolve([]), [selected]);
  const stops = useRemoteData(loadStops);
  async function openMap(url: string) {
    try { await Linking.openURL(url); } catch { setNotice('No se pudo abrir el mapa.'); }
  }
  async function saveRoute(id: string) {
    if (!session) { router.navigate('/login'); return; }
    if (saving) return;
    setSaving(true); setNotice('');
    try { await createRecord('saved-routes', { user_id: session.user.id, route_id: id }); setNotice('Ruta guardada en tu cuenta.'); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  }
  return <Screen title="Catálogo turístico" subtitle="Lugares y rutas de la base de datos">
    <Button title={kind === 'places' ? 'Ver rutas' : 'Ver lugares'} onPress={() => { setKind(kind === 'places' ? 'routes' : 'places'); setSelected(null); }} />
    <FormField label="Buscar" value={query} onChangeText={setQuery} placeholder="Nombre del lugar o ruta" />
    {loading ? <AppText>Cargando catálogo…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {!loading && !error && !data?.[kind].length ? <AppText>No hay registros publicados disponibles.</AppText> : null}
    {data?.[kind].filter((row) => text(row.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((row) => {
      const map = kind === 'places' ? mapUrl(row) : null;
      return <ListCard key={row.id} title={text(row.name)} body={kind === 'places' ? text(row.description || row.address) : `Bs ${text(row.budget)} · ${text(row.available_minutes)} min`}
        footer={<>
          {kind === 'places' ? <PlacePhoto key={row.id} name={text(row.name)} /> : null}
          {map ? <Button title="Abrir mapa real" onPress={() => openMap(map)} /> : null}
          {kind === 'places' ? <Button title="Reseñas" onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId: row.id } })} /> : null}
          {kind === 'routes' ? <Button title="Ver paradas" onPress={() => setSelected(row.id)} /> : null}
          {kind === 'routes' ? <Button title="Guardar en mi cuenta" disabled={saving} onPress={() => saveRoute(row.id)} /> : null}
          {selected === row.id ? <>
            {stops.loading ? <AppText>Cargando paradas…</AppText> : null}
            {stops.error ? <><AppText>{stops.error}</AppText><Button title="Reintentar paradas" onPress={stops.retry} /></> : null}
            {!stops.loading && !stops.error && !stops.data?.length ? <AppText>Sin paradas visibles.</AppText> : null}
            {stops.data?.slice().sort((a, b) => Number(a.position) - Number(b.position)).map((stop) => {
              const place = data.places.find((item) => item.id === stop.place_id);
              const url = place ? mapUrl(place) : null;
              return <ListCard key={stop.id} title={`${text(stop.position)}. ${text(place?.name) || 'Lugar no publicado'}`} body={`${text(stop.visit_minutes)} min de visita`}
                footer={url ? <Button title="Ver ubicación" onPress={() => openMap(url)} /> : undefined} />;
            })}
          </> : null}
        </>} />;
    })}
    <Button title="Actualizar catálogo" disabled={loading} onPress={retry} />
  </Screen>;
}
