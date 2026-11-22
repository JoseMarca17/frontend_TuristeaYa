import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { useCallback } from 'react';
import { useRoutes } from '@/features/turista/route-context';
import { categoryLabels } from '@/features/turista/data/route-planner';
import { loadBackendRoutes } from '@/features/turista/data/backend-routes';
import { useRemoteData } from '@/hooks/use-remote-data';
import { formatDuration } from '@/utils/format';
export default function RutasDisponiblesScreen() {
  const { criteria } = useRoutes();
  const load = useCallback((signal: AbortSignal) => loadBackendRoutes(criteria, signal), [criteria]);
  const { data: results, loading, error, retry } = useRemoteData(load);
  const routes = results ?? [];
  return <Screen title="Rutas disponibles" subtitle={`${routes.length} opciones · ${criteria.departure}`}>
    <AppText variant="body">{criteria.categories.map((category) => categoryLabels[category]).join(' + ')}</AppText>
    <AppText variant="caption">Hasta Bs {criteria.budget} · {formatDuration(criteria.minutes)}</AppText>
    <Button title="Filtrar y ordenar" variant="secondary" onPress={() => router.navigate('/turista/filtros')} />
    {loading ? <AppText>Cargando rutas reales del catálogo…</AppText> : null}
    {error ? <><AppText accessibilityRole="alert">{error}</AppText><Button title="Reintentar" onPress={retry} /></> : null}
    {!loading && !error && !routes.length ? <>
      <ListCard title="No hay coincidencias con estos límites" body={`No encontramos una ruta pública con todas las categorías seleccionadas, hasta Bs ${criteria.budget} y ${criteria.minutes} minutos. Prueba aumentando el presupuesto o el tiempo, o seleccionando una sola categoría.`} />
      <Button title="Ajustar presupuesto, tiempo y categorías" variant="secondary" onPress={() => router.navigate('/turista/crear-ruta')} />
    </> : null}
    {routes.map((route) => <ListCard key={route.id} title={route.name}
      body={`Bs ${route.cost} · ${formatDuration(route.durationMin)} · ${route.distanceKm} km aprox.\n${route.places.map((place) => place.name).join(' → ')}`}
      onPress={() => router.navigate(`/turista/ruta/${route.id}`)} />)}
    <AppText variant="caption">Estas rutas proceden del backend. El tiempo y el costo son los valores publicados por cada ruta; la distancia se estima con las coordenadas de sus paradas.</AppText>
    <Button title="Cambiar categorías, presupuesto o tiempo" variant="secondary" onPress={() => router.navigate('/turista/crear-ruta')} />
  </Screen>;
}
