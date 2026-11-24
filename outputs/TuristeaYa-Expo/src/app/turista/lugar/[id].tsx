import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { SponsoredCampaignBanner } from '@/components/ads/sponsored-banner';
import { Screen } from '@/components/layout/screen';
import { PlacePhoto } from '@/components/place-photo';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { LocationCard } from '@/features/turista/components/location-card';
import { findDiscoveryPlace, type DiscoveryPlace } from '@/features/turista/data/discovery';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { getRecord, listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const weekdayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function LugarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const localPlace = findDiscoveryPlace(id);
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoPlaces = useDemoStore((s) => s.places);
  const demoMatch = !session && demoRole ? demoPlaces.find((p) => p.id === id) : undefined;

  const loadRemote = useCallback(
    async (signal: AbortSignal) => {
      if (localPlace || demoMatch) return null;
      const [place, hours, reviews] = await Promise.all([
        getRecord('places', id, { signal, private: Boolean(session) }),
        listRecords('opening-hours', { signal, filters: { place_id: id } }).catch(() => []),
        listRecords('reviews', { signal, filters: { place_id: id } }).catch(() => []),
      ]);
      return { place, hours, reviews: reviews.filter((r) => !r.hidden) };
    },
    [id, localPlace, demoMatch, session],
  );

  const { data, loading, error, retry } = useRemoteData(loadRemote);

  if (localPlace) {
    return <PlaceDetails key={localPlace.id} place={localPlace} />;
  }

  if (demoMatch) {
    const lat = Number(demoMatch.latitude ?? -16.4955);
    const lng = Number(demoMatch.longitude ?? -68.1336);
    return (
      <RemotePlaceDetails
        placeId={demoMatch.id}
        name={String(demoMatch.name || 'Lugar')}
        description={String(demoMatch.description || '')}
        address={String(demoMatch.address || 'La Paz')}
        estimatedCost={demoMatch.estimated_cost != null ? Number(demoMatch.estimated_cost) : null}
        visitMinutes={demoMatch.visit_minutes != null ? Number(demoMatch.visit_minutes) : null}
        point={{ latitude: lat, longitude: lng }}
        hoursText="Consulta horarios en el local."
        services={Array.isArray(demoMatch.services) ? demoMatch.services.map(String) : []}
        reviewsCount={0}
        averageRating={null}
      />
    );
  }

  if (loading) {
    return (
      <Screen title="Cargando lugar">
        <LoadingState label="Cargando información real del lugar…" />
      </Screen>
    );
  }

  if (error || !data?.place || data.place.published === false) {
    return (
      <Screen
        title={data?.place?.published === false ? 'Lugar no publicado' : 'Lugar no encontrado'}
        subtitle={data?.place?.published === false ? 'Este comercio aún está en revisión administrativa' : 'Esta parada no está disponible'}
      >
        {error ? <ErrorState message={error} onRetry={retry} /> : null}
        <Button title="Explorar catálogo" onPress={() => router.replace('/turista/catalogo')} />
        <Button title="Volver a Inicio" variant="secondary" onPress={() => router.replace('/turista')} />
      </Screen>
    );
  }

  const remote = data.place;
  const lat = Number(remote.latitude);
  const lng = Number(remote.longitude);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const hoursText = data.hours.length
    ? data.hours
      .slice()
      .sort((a, b) => Number(a.weekday) - Number(b.weekday))
      .map((h) => `${weekdayNames[Number(h.weekday)] || 'Día'}: ${String(h.opens_at).slice(0, 5)} - ${String(h.closes_at).slice(0, 5)}`)
      .join('\n')
    : 'Consulta horarios directamente en el lugar.';
  const services = Array.isArray(remote.services) ? remote.services.map(String) : [];
  const ratingSum = data.reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
  const averageRating = data.reviews.length > 0 ? Math.round((ratingSum / data.reviews.length) * 10) / 10 : null;

  return (
    <RemotePlaceDetails
      placeId={remote.id}
      name={String(remote.name || 'Lugar turístico')}
      description={String(remote.description || 'Sin descripción adicional.')}
      address={String(remote.address || 'Ubicación registrada')}
      estimatedCost={remote.estimated_cost != null ? Number(remote.estimated_cost) : null}
      visitMinutes={remote.visit_minutes != null ? Number(remote.visit_minutes) : null}
      point={hasPoint ? { latitude: lat, longitude: lng } : null}
      hoursText={hoursText}
      services={services}
      reviewsCount={data.reviews.length}
      averageRating={averageRating}
    />
  );
}

function RemotePlaceDetails({
  placeId,
  name,
  description,
  address,
  estimatedCost,
  visitMinutes,
  point,
  hoursText,
  services,
  reviewsCount,
  averageRating,
}: {
  placeId: string;
  name: string;
  description: string;
  address: string;
  estimatedCost: number | null;
  visitMinutes: number | null;
  point: { latitude: number; longitude: number } | null;
  hoursText: string;
  services: string[];
  reviewsCount: number;
  averageRating: number | null;
}) {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const addDemoVisit = useDemoStore((s) => s.addVisit);
  const addDemoTicket = useDemoStore((s) => s.addTicket);
  const showToast = useUiStore((s) => s.showToast);
  const [visiting, setVisiting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reporting, setReporting] = useState(false);

  async function submitPlaceReport() {
    if (!reportText.trim() || reporting) return;
    if (isDemo) {
      addDemoTicket({
        id: `demo-tk-${Date.now()}`,
        user_id: `demo-${demoRole}`,
        place_id: placeId,
        kind: 'other',
        priority: 'medium',
        status: 'pending',
        subject: `Información incorrecta en ${name}`,
        description: reportText.trim(),
        created_at: new Date().toISOString(),
      });
      setReportText('');
      setReportOpen(false);
      showToast('Reporte enviado a soporte.', 'success');
      return;
    }
    if (!session) {
      router.navigate('/login');
      return;
    }
    setReporting(true);
    try {
      await createRecord(
        'tickets',
        {
          user_id: session.user.id,
          place_id: placeId,
          kind: 'other',
          priority: 'medium',
          subject: `Información incorrecta en ${name}`,
          description: reportText.trim(),
        },
        'Enviando reporte…',
      );
      setReportText('');
      setReportOpen(false);
      showToast('Reporte enviado.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo enviar el reporte.', 'error');
    } finally {
      setReporting(false);
    }
  }

  async function logVisit() {
    if (isDemo) {
      addDemoVisit(placeId, name);
      showToast('Visita registrada en tu historial.', 'success');
      return;
    }
    if (!session) {
      router.navigate('/login');
      return;
    }
    if (visiting) return;
    setVisiting(true);
    try {
      await createRecord('place-visits', { user_id: session.user.id, place_id: placeId }, 'Registrando visita…');
      showToast('Visita registrada.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo registrar la visita.', 'error');
    } finally {
      setVisiting(false);
    }
  }

  return (
    <Screen title={name} subtitle="Detalle del lugar">
      {point ? <LocationCard point={point} title={name} note={address} /> : null}
      <PlacePhoto name={name} />
      <AppText variant="body">{description}</AppText>

      <SponsoredCampaignBanner placement="detail" origin={point} />

      <View style={styles.badgeRow}>
        {averageRating != null ? <Badge label={`★ ${averageRating} / 5`} tone="green" /> : null}
        {estimatedCost != null ? <Badge label={`Est. Bs ${estimatedCost}`} tone="green" /> : null}
        {visitMinutes != null ? <Badge label={`${visitMinutes} min sugeridos`} tone="cream" /> : null}
        <Badge label={`${reviewsCount} reseñas`} tone="green" />
      </View>

      <ListCard
        title="Información y horarios"
        body={[address, hoursText, services.length ? `Servicios: ${services.join(' · ')}` : ''].filter(Boolean).join('\n\n')}
      />

      {point ? (
        <Button
          align="left"
          title="Abrir indicaciones en Google Maps"
          onPress={() => {
            void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`);
          }}
        />
      ) : null}
      <Button
        align="left"
        title={visiting ? 'Registrando…' : 'Registrar visita en mi cuenta'}
        variant="secondary"
        disabled={visiting}
        onPress={() => { void logVisit(); }}
      />
      <Button
        align="left"
        title={`Ver o escribir reseñas (${reviewsCount})`}
        variant="secondary"
        onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId } })}
      />
      <Button align="left" title="Ver cupones disponibles" variant="soft" onPress={() => router.navigate('/turista/cupones')} />
      <Button
        align="left"
        title={reportOpen ? 'Cancelar reporte' : 'Reportar información incorrecta'}
        variant="secondary"
        onPress={() => setReportOpen((v) => !v)}
      />
      {reportOpen ? (
        <View style={styles.card}>
          <AppText variant="label">¿Qué dato está desactualizado o incorrecto?</AppText>
          <FormField
            label="Detalle del reporte"
            placeholder="Ej. Horario cerrado los lunes, precio actualizado a Bs 25…"
            value={reportText}
            onChangeText={setReportText}
            multiline
          />
          <Button
            title={reporting ? 'Enviando…' : 'Enviar reporte al administrador'}
            disabled={reporting || !reportText.trim()}
            onPress={() => { void submitPlaceReport(); }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function PlaceDetails({ place }: { place: DiscoveryPlace }) {
  const [sourceError, setSourceError] = useState('');
  const { routes } = useRoutes();
  const containingRoutes = routes.filter((route) => route.placeIds.includes(place.id));

  return (
    <Screen title={place.name} subtitle={place.isDemo ? 'La Paz · Lugar de demostración' : 'La Paz, Bolivia · Lugar real'}>
      <LocationCard point={place.point} title={place.name} note={place.mapNote} />
      <PlacePhoto name={place.name} />
      <AppText variant="body">{place.description}</AppText>
      <ListCard
        title="Antes de tu visita"
        body={
          place.isDemo
            ? `Desde Bs ${place.priceFrom} · Calificación ${place.rating} / 5\nHorario de ejemplo: ${place.hours}\n${place.services.join(' · ')}\n${place.address}`
            : `${place.address}\n${place.hours}${place.estimatedCost != null ? `\nPresupuesto orientativo: Bs ${place.estimatedCost} (no es una tarifa confirmada)` : ''}\n${place.services.join(' · ')}`
        }
        footer={place.isDemo ? <AppText variant="micro">Precios, horarios, valoraciones y promociones simulados.</AppText> : undefined}
      />
      <Button
        align="left"
        title="Guardar en una ruta"
        disabled={place.isDemo}
        onPress={() => router.navigate({ pathname: '/turista/guardar-lugar', params: { placeId: place.id } })}
      />
      {containingRoutes.length ? (
        <AppText variant="caption">Incluido en: {containingRoutes.map((route) => route.name).join(', ')}</AppText>
      ) : null}
      <Button
        align="left"
        title="Ver reseñas"
        variant="secondary"
        onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId: place.id } })}
      />
      <Button align="left" title="Ver cupones" variant="secondary" onPress={() => router.navigate('/turista/cupones')} />
      <Button
        align="left"
        title="Reportar información incorrecta"
        variant="secondary"
        onPress={() => router.navigate('/RamaNegocio/reportar')}
      />
      {place.sourceUrl ? (
        <Button
          align="left"
          title="Consultar información turística oficial"
          variant="secondary"
          onPress={async () => {
            try {
              setSourceError('');
              await Linking.openURL(place.sourceUrl!);
            } catch {
              setSourceError('No se pudo abrir la página. Revisa tu conexión.');
            }
          }}
        />
      ) : null}
      {sourceError ? <AppText variant="bodySmall">{sourceError}</AppText> : null}
      <Button
        align="left"
        title="Volver"
        variant="secondary"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/turista');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
