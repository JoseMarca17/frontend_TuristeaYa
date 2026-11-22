import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { LocationCard } from '@/features/turista/components/location-card';
import { RouteStatus } from '@/features/turista/components/route-status';
import { useRoutes } from '@/features/turista/route-context';
import { realPlaces } from '@/features/turista/data/real-places';
import { categoryLabels } from '@/features/turista/data/route-planner';
import { loadBackendRoute, type BackendPlannedRoute, type BackendRoutePlace } from '@/features/turista/data/backend-routes';
import { useRemoteData } from '@/hooks/use-remote-data';
import { createRecord } from '@/services/management';
import { formatDuration } from '@/utils/format';

type LocalRoute = NonNullable<ReturnType<ReturnType<typeof useRoutes>['findRoute']>>;
type DisplayRoute = BackendPlannedRoute | LocalRoute;
type DisplayPlace = BackendRoutePlace | (typeof realPlaces)[number];

export default function RutaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { findRoute, routes, ready, busy, repository } = useRoutes();
  const localRoute = findRoute(id);
  const load = useCallback(async (signal: AbortSignal): Promise<BackendPlannedRoute | LocalRoute | null> => localRoute ?? loadBackendRoute(id, signal), [id, localRoute]);
  const { data: loadedRoute, loading, error, retry } = useRemoteData(load);
  const route: DisplayRoute | null = loadedRoute;
  if (loading) return <Screen title="Cargando ruta"><AppText>Cargando la ruta y sus paradas reales…</AppText></Screen>;
  if (error) return <Screen title="No se pudo cargar la ruta"><AppText accessibilityRole="alert">{error}</AppText><Button title="Reintentar" onPress={retry} /><Button title="Volver" onPress={() => router.back()} /></Screen>;
  if (!route) return <Screen title="Ruta no disponible"><RouteStatus /><Button title="Ver mis rutas" onPress={() => router.replace('/turista/mis-rutas')} /></Screen>;
  const saved = routes.find((item) => item.id === id || item.sourceId === id);
  const displayed = saved ?? route;
  const places: DisplayPlace[] = 'places' in displayed
    ? displayed.places
    : displayed.placeIds.map((placeId) => realPlaces.find((place) => place.id === placeId)).filter((place): place is (typeof realPlaces)[number] => Boolean(place));
  const first = places[0];
  return <Screen title={displayed.name} subtitle={`${places.length} paradas · ${formatDuration(displayed.durationMin)} aprox.`}>
    <RouteStatus />
    <AppText variant="body">{displayed.categories.map((category) => categoryLabels[category]).join(' + ')}</AppText>
    <AppText variant="caption">Salida: {displayed.departure} · Bs {displayed.cost} estimados · {displayed.distanceKm} km aprox.</AppText>
    {first?.point ? <LocationCard point={first.point} title={first.name} note="Mapa de la primera parada. Abre cada lugar para ver su ubicación." /> : null}
    {places.map((place, index) => {
      const categories = 'categories' in place ? place.categories : [place.category];
      return <ListCard key={place.id} title={`${index + 1}. ${place.name}`} body={`${categories.map((category) => categoryLabels[category]).join(' · ')} · Visita sugerida: ${place.visitMinutes} min · Presupuesto orientativo: Bs ${place.estimatedCost}`} onPress={() => router.navigate(`/turista/lugar/${place.id}`)} />;
    })}
    <AppText variant="caption">Ruta cargada desde el backend. La distancia es una estimación entre coordenadas; no sustituye la navegación calle por calle. Confirma accesos, horarios y tarifas.</AppText>
    {saved ? <>
      <AppText variant="label">✓ Ruta guardada en este dispositivo</AppText>
      <Button title="Editar paradas" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${saved.id}/editar-paradas`)} />
      <Button title="Ver en Mis rutas" onPress={() => router.navigate('/turista/mis-rutas')} />
    </> : <RemoteOrLocalSave route={displayed} localRoute={localRoute} ready={ready} busy={busy} repository={repository} />}
    <Button title="Compartir itinerario" variant="secondary" onPress={() => router.navigate(`/turista/ruta/${displayed.id}/compartir`)} />
  </Screen>;
}

function RemoteOrLocalSave({ route, localRoute, ready, busy, repository }: {
  route: DisplayRoute;
  localRoute: LocalRoute | undefined;
  ready: boolean;
  busy: boolean;
  repository: ReturnType<typeof useRoutes>['repository'];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (localRoute && !('places' in route)) {
        const savedId = await repository.save(localRoute);
        router.replace(`/turista/ruta/${savedId}`);
      } else {
        await createRecord('saved-routes', { route_id: route.id });
        setMessage('Ruta guardada en tu cuenta.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  }
  return <>
    {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
    <Button title={saving ? 'Guardando…' : localRoute ? 'Guardar ruta' : 'Guardar en mi cuenta'} disabled={saving || busy || (!localRoute && !('places' in route)) || (Boolean(localRoute) && !ready)} onPress={() => { void save(); }} />
  </>;
}
