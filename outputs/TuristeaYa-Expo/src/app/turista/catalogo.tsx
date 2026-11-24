import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { PlacePhoto } from '@/components/place-photo';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useUiStore } from '@/stores/use-ui-store';
import { spacing } from '@/theme';

const text = (value: unknown) => (value == null ? '' : String(value));

function mapUrl(place: CatalogRow) {
  if (place.latitude == null || place.longitude == null) return null;
  const lat = Number(place.latitude);
  const lng = Number(place.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;
}

export default function CatalogScreen() {
  const session = useAuthStore((s) => s.session);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const showToast = useUiStore((s) => s.showToast);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'places' | 'routes'>('places');
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const [places, routes] = await Promise.all([
      listRecords('places', { signal }),
      listRecords('routes', { signal, private: Boolean(session) }),
    ]);
    return {
      places: places.filter((row) => row.published === true),
      routes: routes.filter((row) => row.visibility === 'public' || row.user_id === session?.user.id),
    };
  }, [session]);

  const { data, loading, error, retry } = useRemoteData(load);
  const loadStops = useCallback(
    (signal: AbortSignal) =>
      selected ? listRecords('route-stops', { signal, filters: { route_id: selected } }) : Promise.resolve([]),
    [selected],
  );
  const stops = useRemoteData(loadStops);

  async function openMap(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showToast('No se pudo abrir el mapa.', 'error');
    }
  }

  async function saveRoute(id: string) {
    if (!session) { router.navigate('/login'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await createRecord('saved-routes', { user_id: session.user.id, route_id: id }, 'Guardando ruta en tu cuenta…');
      showToast('Ruta guardada en tu cuenta.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function registerVisit(placeId: string) {
    if (!session) { router.navigate('/login'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await createRecord('place-visits', { user_id: session.user.id, place_id: placeId }, 'Registrando visita…');
      showToast('Visita registrada en Render.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo registrar la visita.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Catálogo turístico" subtitle="Lugares y rutas reales de Render">
      <View style={styles.tabs}>
        <Chip label="Lugares" selected={kind === 'places'} onPress={() => { setKind('places'); setSelected(null); }} />
        <Chip label="Rutas" selected={kind === 'routes'} onPress={() => { setKind('routes'); setSelected(null); }} />
      </View>

      <FormField label="Buscar" value={query} onChangeText={setQuery} placeholder="Nombre del lugar o ruta" />

      {loading ? <LoadingState label="Cargando catálogo desde Render…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {!loading && !error && !data?.[kind].length ? <AppText>No hay registros publicados disponibles.</AppText> : null}

      {data?.[kind]
        .filter((row) => text(row.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        .map((row) => {
          const map = kind === 'places' ? mapUrl(row) : null;
          const pricing = kind === 'routes' ? calculateDiscountedCost(Number(row.budget ?? 0), activeCoupon) : null;
          const routeBody = pricing && pricing.discountPercent > 0
            ? `Bs ${pricing.finalCost} (antes Bs ${pricing.originalCost}, -${pricing.discountPercent}%) · ${text(row.available_minutes)} min`
            : `Bs ${text(row.budget)} · ${text(row.available_minutes)} min`;

          return (
            <ListCard
              key={row.id}
              title={text(row.name)}
              body={kind === 'places' ? text(row.description || row.address) : routeBody}
              onPress={
                kind === 'places'
                  ? () => router.navigate(`/turista/lugar/${row.id}`)
                  : () => router.navigate(`/turista/ruta/${row.id}`)
              }
              footer={
                <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
                  {kind === 'places' ? <PlacePhoto key={row.id} name={text(row.name)} /> : null}
                  <View style={styles.actionRow}>
                    {map ? <Button title="Mapa real" size="sm" variant="secondary" onPress={() => { void openMap(map); }} /> : null}
                    {kind === 'places' ? (
                      <>
                        <Button title="Reseñas" size="sm" variant="secondary" onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId: row.id } })} />
                        <Button title="Registrar visita" size="sm" variant="soft" disabled={saving} onPress={() => { void registerVisit(row.id); }} />
                      </>
                    ) : (
                      <>
                        <Button title={selected === row.id ? 'Ocultar paradas' : 'Ver paradas'} size="sm" variant="secondary" onPress={() => setSelected(selected === row.id ? null : row.id)} />
                        <Button title="Guardar" size="sm" disabled={saving} onPress={() => { void saveRoute(row.id); }} />
                      </>
                    )}
                  </View>
                  {selected === row.id ? (
                    <>
                      {stops.loading ? <AppText variant="caption">Cargando paradas…</AppText> : null}
                      {stops.error ? <ErrorState message={stops.error} onRetry={stops.retry} /> : null}
                      {!stops.loading && !stops.error && !stops.data?.length ? <AppText variant="caption">Sin paradas visibles.</AppText> : null}
                      {stops.data
                        ?.slice()
                        .sort((a, b) => Number(a.position) - Number(b.position))
                        .map((stop) => {
                          const place = data.places.find((item) => item.id === stop.place_id);
                          const url = place ? mapUrl(place) : null;
                          return (
                            <ListCard
                              key={stop.id}
                              title={`${text(stop.position)}. ${text(place?.name) || 'Lugar no publicado'}`}
                              body={`${text(stop.visit_minutes)} min de visita`}
                              footer={url ? <Button title="Ver ubicación" size="sm" variant="secondary" onPress={() => { void openMap(url); }} /> : undefined}
                            />
                          );
                        })}
                    </>
                  ) : null}
                </View>
              }
            />
          );
        })}
      <Button title="Actualizar catálogo" variant="secondary" disabled={loading} onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
