import { useCallback, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { RouteStatus } from '@/features/turista/components/route-status';
import { loadBackendRoute } from '@/features/turista/data/backend-routes';
import { realPlaces } from '@/features/turista/data/real-places';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { computeSnapshotHash } from '@/services/domain-rules';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { spacing } from '@/theme';

export default function CompartirRutaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { findRoute } = useRoutes();
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);
  const [error, setError] = useState('');

  const localRoute = findRoute(id);
  const loadRemote = useCallback(
    (signal: AbortSignal) => (localRoute ? Promise.resolve(null) : loadBackendRoute(id, signal, session?.user.id)),
    [id, localRoute, session?.user.id],
  );
  const { data: remoteRoute } = useRemoteData(loadRemote);

  const activeRoute = localRoute ?? remoteRoute;
  const stops = activeRoute
    ? 'places' in activeRoute
      ? activeRoute.places.map((p) => ({
          id: p.id,
          name: p.name,
          cost: p.estimatedCost,
          visitMinutes: p.visitMinutes,
        }))
      : activeRoute.placeIds.map((pid) => {
          const p = realPlaces.find((item) => item.id === pid);
          return {
            id: pid,
            name: p?.name || pid,
            cost: p?.estimatedCost ?? 0,
            visitMinutes: p?.visitMinutes ?? 45,
          };
        })
    : [];

  const shareSlug = activeRoute && 'shareSlug' in activeRoute && activeRoute.shareSlug
    ? activeRoute.shareSlug
    : activeRoute?.id || id;
  const snapshotHash = computeSnapshotHash(stops);
  const updatedAt = activeRoute && 'createdAt' in activeRoute && activeRoute.createdAt
    ? activeRoute.createdAt
    : new Date().toISOString();
  const shareUrl = `https://turisteaya.app/turista/ruta/${encodeURIComponent(id)}?slug=${encodeURIComponent(shareSlug)}&v=1&hash=${encodeURIComponent(snapshotHash)}`;

  const message = activeRoute
    ? `${activeRoute.name}\nSlug compartido: ${shareSlug}\nVersión snapshot: v1 (${snapshotHash})\nActualización: ${new Date(updatedAt).toLocaleDateString()}\nSalida: ${activeRoute.departure}\n${stops.map((s, idx) => `${idx + 1}. ${s.name} (Bs ${s.cost} · ${s.visitMinutes} min)`).join('\n')}\nPresupuesto estimado: Bs ${activeRoute.cost} · Duración: ${activeRoute.durationMin} min.\nEnlace verificable: ${shareUrl}`
    : '';

  async function copyShareLink() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Enlace con share_slug y versión copiado al portapapeles.', 'success');
      } else {
        await Share.share({ message });
      }
    } catch {
      setError('No se pudo copiar automáticamente; selecciona y copia el texto.');
    }
  }

  return (
    <Screen title="Compartir itinerario" subtitle={activeRoute?.name || 'Enlace con versión y snapshot'}>
      <RouteStatus />
      {activeRoute ? (
        <ListCard
          title={`Slug: ${shareSlug}`}
          body={`Snapshot inmutable v1 (${snapshotHash})\nPublicado/actualizado: ${new Date(updatedAt).toLocaleString()}\nIncluye ${stops.length} paradas congeladas para detectar si el catálogo cambia después.`}
          footer={
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Badge label={`Versión v1`} tone="green" />
              <Badge label={snapshotHash} tone="cream" />
            </View>
          }
        />
      ) : null}
      <AppText variant="body" selectable>{message || 'Ruta no disponible.'}</AppText>
      <Button title="Copiar enlace con versión" disabled={!activeRoute} onPress={() => { void copyShareLink(); }} />
      <Button
        title="Compartir con otra aplicación"
        variant="secondary"
        disabled={!activeRoute}
        onPress={async () => {
          try {
            await Share.share({ message });
          } catch {
            setError('No se pudo compartir. Puedes seleccionar y copiar el itinerario de arriba.');
          }
        }}
      />
      {error ? <AppText variant="caption">{error}</AppText> : null}
      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
