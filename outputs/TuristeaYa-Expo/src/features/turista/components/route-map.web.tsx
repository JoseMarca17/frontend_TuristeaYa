import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import type { RouteMapProps } from './route-map.types';
import { borderWidth, colors, radius, spacing } from '@/theme';

function projectPoint(
  point: { latitude: number; longitude: number },
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  width: number,
  height: number,
) {
  const pad = 28;
  const spanLng = Math.max(0.004, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(0.004, bounds.maxLat - bounds.minLat);
  const x = pad + ((point.longitude - bounds.minLng) / spanLng) * (width - pad * 2);
  const y = pad + ((bounds.maxLat - point.latitude) / spanLat) * (height - pad * 2);
  return { x, y };
}

export function RouteMap({ origin, stops, title = 'Polilínea de ruta', height = 220, onPickPoint }: RouteMapProps) {
  const validStops = stops.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const points = [
    ...(origin && Number.isFinite(origin.latitude) ? [{ name: 'Origen', ...origin, isOrigin: true }] : []),
    ...validStops.map((s, idx) => ({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      label: String(s.position ?? idx + 1),
      isOrigin: false,
    })),
  ];

  const fallbackCenter = { latitude: -16.4955, longitude: -68.1336 };
  const lats = points.length ? points.map((p) => p.latitude) : [fallbackCenter.latitude];
  const lngs = points.length ? points.map((p) => p.longitude) : [fallbackCenter.longitude];
  const bounds = {
    minLat: Math.min(...lats) - 0.002,
    maxLat: Math.max(...lats) + 0.002,
    minLng: Math.min(...lngs) - 0.002,
    maxLng: Math.max(...lngs) + 0.002,
  };

  const width = 560;
  const svgHeight = Math.max(170, height);
  const projected = points.map((p) => ({ ...p, ...projectPoint(p, bounds, width, svgHeight) }));
  const polylinePoints = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  function openExternalDirections() {
    if (validStops.length === 0) return;
    const start = origin ? `${origin.latitude},${origin.longitude}` : `${validStops[0].latitude},${validStops[0].longitude}`;
    const dest = `${validStops[validStops.length - 1].latitude},${validStops[validStops.length - 1].longitude}`;
    const waypoints = validStops.slice(origin ? 0 : 1, -1).map((s) => `${s.latitude},${s.longitude}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=walking`;
    void Linking.openURL(url);
  }

  return (
    <View style={styles.container} accessibilityRole="region" accessibilityLabel={`${title} con ${validStops.length} paradas`}>
      <View style={styles.headerRow}>
        <AppText variant="micro" color="primary">
          {title} · {validStops.length} parada(s) conectadas
        </AppText>
        {validStops.length > 0 ? (
          <Pressable
            onPress={openExternalDirections}
            accessibilityRole="link"
            accessibilityLabel="Abrir recorrido completo en Google Maps"
          >
            <AppText variant="caption" color="primary">
              Abrir en Google Maps
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <div
        onClick={(event) => {
          if (!onPickPoint) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const pad = 28;
          const relX = Math.max(0, Math.min(1, (event.clientX - rect.left - pad) / Math.max(1, rect.width - pad * 2)));
          const relY = Math.max(0, Math.min(1, (event.clientY - rect.top - pad) / Math.max(1, rect.height - pad * 2)));
          const lng = bounds.minLng + relX * (bounds.maxLng - bounds.minLng);
          const lat = bounds.maxLat - relY * (bounds.maxLat - bounds.minLat);
          onPickPoint({
            latitude: Math.round(lat * 100000) / 100000,
            longitude: Math.round(lng * 100000) / 100000,
          });
        }}
        style={{
          width: '100%',
          height: svgHeight,
          borderRadius: radius.sm,
          overflow: 'hidden',
          backgroundColor: colors.surfaceGreenSoft,
          border: `1px solid ${colors.borderSoftGreen}`,
          cursor: onPickPoint ? 'crosshair' : 'default',
        }}
      >
        <svg viewBox={`0 0 ${width} ${svgHeight}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={`h-${ratio}`}
              x1={0}
              x2={width}
              y1={svgHeight * ratio}
              y2={svgHeight * ratio}
              stroke={colors.surface}
              strokeWidth={1}
            />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={`v-${ratio}`}
              y1={0}
              y2={svgHeight}
              x1={width * ratio}
              x2={width * ratio}
              stroke={colors.surface}
              strokeWidth={1}
            />
          ))}

          {projected.length >= 2 ? (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={colors.primaryDeep}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {projected.map((pt, idx) => (
            <g key={`pt-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={pt.isOrigin ? 9 : 13}
                fill={pt.isOrigin ? colors.primaryDeep : colors.surface}
                stroke={colors.primaryDeep}
                strokeWidth={2.5}
              />
              <text
                x={pt.x}
                y={pt.y + 4}
                textAnchor="middle"
                fontSize={pt.isOrigin ? 9 : 11}
                fontWeight="700"
                fill={pt.isOrigin ? colors.surface : colors.ink}
              >
                {pt.isOrigin ? 'O' : 'label' in pt ? pt.label : String(idx)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {onPickPoint ? (
        <AppText variant="caption" color="inkMuted">
          Haz clic sobre el recuadro geográfico para ajustar las coordenadas del punto.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
