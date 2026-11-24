import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { RouteMapProps } from './route-map.types';
import { colors, radius } from '@/theme';

export function RouteMap({ origin, stops, title = 'Ruta en el mapa', height = 240, onPickPoint }: RouteMapProps) {
  const validStops = stops.filter(
    (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
  );
  const allPoints = [
    ...(origin && Number.isFinite(origin.latitude) ? [origin] : []),
    ...validStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
  ];

  const center = allPoints[0] ?? { latitude: -16.4955, longitude: -68.1336 };
  const lats = allPoints.map((p) => p.latitude);
  const lngs = allPoints.map((p) => p.longitude);
  const latDelta = allPoints.length > 1 ? Math.max(0.015, (Math.max(...lats) - Math.min(...lats)) * 1.45) : 0.015;
  const lngDelta = allPoints.length > 1 ? Math.max(0.015, (Math.max(...lngs) - Math.min(...lngs)) * 1.45) : 0.015;

  return (
    <View
      style={[styles.box, { height }]}
      accessibilityLabel={`${title}: ${validStops.length} paradas`}
    >
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: (Math.max(...lats, center.latitude) + Math.min(...lats, center.latitude)) / 2,
          longitude: (Math.max(...lngs, center.longitude) + Math.min(...lngs, center.longitude)) / 2,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        }}
        onPress={(event) => {
          if (onPickPoint && event.nativeEvent?.coordinate) {
            onPickPoint(event.nativeEvent.coordinate);
          }
        }}
      >
        {origin ? (
          <Marker coordinate={origin} title="Origen" pinColor={colors.primaryDeep} />
        ) : null}
        {validStops.map((stop, idx) => (
          <Marker
            key={`${stop.id}-${idx}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={`${stop.position ?? idx + 1}. ${stop.name}`}
            pinColor={colors.primary}
          />
        ))}
        {allPoints.length >= 2 ? (
          <Polyline coordinates={allPoints} strokeColor={colors.primaryDeep} strokeWidth={4} />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
