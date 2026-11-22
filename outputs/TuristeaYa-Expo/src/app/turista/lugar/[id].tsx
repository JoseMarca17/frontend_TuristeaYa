import { useState } from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { LocationCard } from '@/features/turista/components/location-card';
import { findDiscoveryPlace, type DiscoveryPlace } from '@/features/turista/data/discovery';
import { useRoutes } from '@/features/turista/route-context';

export default function LugarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = findDiscoveryPlace(id);
  if (!place) return <Screen title="Lugar no encontrado" subtitle="Esta parada no está disponible">
    <Button title="Volver a Inicio" onPress={() => router.replace('/turista')} />
  </Screen>;
  return <PlaceDetails key={place.id} place={place} />;
}

function PlaceDetails({ place }: { place: DiscoveryPlace }) {
  const [sourceError, setSourceError] = useState('');
  const { routes } = useRoutes();
  const containingRoutes = routes.filter((route) => route.placeIds.includes(place.id));

  return (
    <Screen title={place.name} subtitle={place.isDemo ? 'La Paz · Lugar de demostración' : 'La Paz, Bolivia · Lugar real'}>
      <LocationCard point={place.point} title={place.name} note={place.mapNote} />
      <AppText variant="body">{place.description}</AppText>
      <ListCard title="Antes de tu visita" body={place.isDemo
        ? `Desde Bs ${place.priceFrom} · Calificación ${place.rating} / 5\nHorario de ejemplo: ${place.hours}\n${place.services.join(' · ')}\n${place.address}`
        : `${place.address}\n${place.hours}${place.estimatedCost != null ? `\nPresupuesto orientativo: Bs ${place.estimatedCost} (no es una tarifa confirmada)` : ''}\n${place.services.join(' · ')}`}
        footer={place.isDemo ? <AppText variant="micro">Precios, horarios, valoraciones y promociones simulados.</AppText> : undefined} />
      <Button align="left" title="Guardar en una ruta" disabled={place.isDemo} onPress={() => router.navigate({ pathname: '/turista/guardar-lugar', params: { placeId: place.id } })} />
      {containingRoutes.length ? <AppText variant="caption">Incluido en: {containingRoutes.map((route) => route.name).join(', ')}</AppText> : null}
      <Button align="left" title="Ver reseñas" variant="secondary" onPress={() => router.navigate({ pathname: '/turista/resenas', params: { placeId: place.id } })} />
      <Button align="left" title="Ver cupones" variant="secondary" onPress={() => router.navigate('/turista/cupones')} />
      <Button align="left" title="Reportar información incorrecta" variant="secondary" onPress={() => router.navigate('/RamaNegocio/reportar')} />
      {place.sourceUrl ? <Button align="left" title="Consultar información turística oficial" variant="secondary" onPress={async () => {
        try { setSourceError(''); await Linking.openURL(place.sourceUrl!); }
        catch { setSourceError('No se pudo abrir la página. Revisa tu conexión.'); }
      }} /> : null}
      {sourceError ? <AppText variant="bodySmall">{sourceError}</AppText> : null}
      <Button align="left" title="Volver" variant="secondary" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/turista'); }} />
    </Screen>
  );
}
