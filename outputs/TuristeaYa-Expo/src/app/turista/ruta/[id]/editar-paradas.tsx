import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { RouteMap } from '@/features/turista/components/route-map';
import { RouteStatus } from '@/features/turista/components/route-status';
import { useRoutes } from '@/features/turista/route-context';
import { calculateRoute, type PlannedRoute } from '@/features/turista/data/route-planner';
import { realPlaces } from '@/features/turista/data/real-places';
import { calculateRouteMetrics, optimizeStopsNearestNeighbor } from '@/services/domain-rules';
import { formatDuration } from '@/utils/format';
import { spacing } from '@/theme';

export default function EditarParadasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { routes } = useRoutes();
  const route = routes.find((item) => item.id === id);
  if (!route) return <Screen title="Editar paradas"><RouteStatus /><AppText variant="body">Primero guarda la ruta.</AppText></Screen>;
  return <Editor key={route.id} route={route} />;
}

function Editor({ route }: { route: PlannedRoute }) {
  const { busy, repository } = useRoutes();
  const [ids, setIds] = useState(route.placeIds);
  const preview = calculateRoute({ ...route, placeIds: ids });
  const stopObjects = ids
    .map((pid) => realPlaces.find((p) => p.id === pid))
    .filter((p): p is (typeof realPlaces)[number] => Boolean(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      latitude: p.point.latitude,
      longitude: p.point.longitude,
      estimatedCost: p.estimatedCost ?? 0,
      visitMinutes: p.visitMinutes ?? 45,
    }));
  const liveCalc = calculateRouteMetrics(route.origin, stopObjects);

  function move(index: number, offset: number) {
    const next = [...ids];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIds(next);
  }

  function optimizeOrder() {
    const optimized = optimizeStopsNearestNeighbor(route.origin, stopObjects);
    setIds(optimized.map((p) => p.id));
  }

  return (
    <Screen title="Editar y optimizar paradas" subtitle={route.name}>
      <RouteStatus />
      <RouteMap
        origin={route.origin}
        stops={stopObjects.map((s, index) => ({
          id: s.id,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          position: index + 1,
        }))}
        title="Vista previa con polilínea"
      />
      <Button title="Optimizar orden (menos caminata)" variant="soft" size="sm" disabled={busy || ids.length <= 1} onPress={optimizeOrder} />
      {ids.map((id, index) => (
        <ListCard
          key={id}
          title={`${index + 1}. ${realPlaces.find((p) => p.id === id)?.name || id}`}
          footer={
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Button title="Subir" size="sm" variant="secondary" disabled={busy || index === 0} onPress={() => move(index, -1)} />
              <Button title="Bajar" size="sm" variant="secondary" disabled={busy || index === ids.length - 1} onPress={() => move(index, 1)} />
              <Button title="Quitar parada" size="sm" variant="soft" disabled={busy || ids.length === 1} onPress={() => setIds(ids.filter((item) => item !== id))} />
            </View>
          }
        />
      ))}
      <ListCard
        title="Recálculo automático en vivo"
        body={`Costo: Bs ${liveCalc.finalCost} · Duración total: ${formatDuration(liveCalc.totalDurationMinutes)} (${liveCalc.totalTravelMinutes} min traslado + ${liveCalc.totalVisitMinutes} min visita) · Distancia: ${liveCalc.totalDistanceKm} km (ref: Bs ${preview.cost})`}
        footer={<Badge label={`Hash snapshot ${liveCalc.snapshotHash}`} tone="green" />}
      />
      <Button
        title="Guardar cambios"
        disabled={busy}
        onPress={() => {
          void repository.updateStops(route.id, ids).then(() => router.back()).catch(() => undefined);
        }}
      />
      <Button title="Cancelar" variant="secondary" disabled={busy} onPress={() => router.back()} />
    </Screen>
  );
}
