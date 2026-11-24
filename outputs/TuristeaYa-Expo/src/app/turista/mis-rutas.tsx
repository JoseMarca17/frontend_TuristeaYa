import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RouteStatus } from '@/features/turista/components/route-status';
import { useRoutes } from '@/features/turista/route-context';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { colors, radius, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

const options = ['Guardadas', 'Visitadas'] as const;

export default function MisRutasScreen() {
  const { routes, ready, busy, repository } = useRoutes();
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const [filter, setFilter] = useState<(typeof options)[number]>('Guardadas');
  const [deleting, setDeleting] = useState<string | null>(null);
  const visible = routes.filter((route) => (filter === 'Visitadas' ? route.visited : !route.visited));

  return (
    <Screen title="Mis rutas" subtitle="Guardadas en este dispositivo">
      <RouteStatus />
      {activeCoupon ? (
        <View style={styles.couponBox}>
          <View style={styles.rowBetween}>
            <AppText variant="label" color="primary">
              Cupón canjeado aplicado: -{activeCoupon.discountPercent}%
            </AppText>
            <Badge label={activeCoupon.code} tone="green" />
          </View>
          <AppText variant="caption" color="inkSoft">{activeCoupon.title}</AppText>
        </View>
      ) : null}

      <SegmentedControl label="Mostrar" options={options} value={filter} onChange={setFilter} />

      {ready && !visible.length ? (
        <AppText variant="body">
          {filter === 'Visitadas' ? 'Aún no marcaste rutas como visitadas.' : 'Aún no tienes rutas pendientes guardadas.'}
        </AppText>
      ) : null}

      {visible.map((route) => {
        const pricing = calculateDiscountedCost(route.cost, activeCoupon);
        const priceSummary =
          pricing.discountPercent > 0
            ? `Bs ${pricing.finalCost} (antes Bs ${pricing.originalCost}, -${pricing.discountPercent}%)`
            : `Bs ${route.cost} estimados`;
        return (
          <ListCard
            key={route.id}
            title={route.name}
            body={`${route.placeIds.length} paradas · ${priceSummary} · ${formatDuration(route.durationMin)} aprox.`}
            footer={
              <View style={styles.actions}>
                <Button title="Ver ruta" size="sm" onPress={() => router.navigate(`/turista/ruta/${route.id}`)} />
                <Button
                  title={route.visited ? 'Mover a pendientes' : 'Marcar como visitada'}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => { void repository.setVisited(route.id, !route.visited).catch(() => undefined); }}
                />
                {deleting === route.id ? (
                  <>
                    <AppText variant="caption">¿Eliminar esta ruta de tus guardadas?</AppText>
                    <Button
                      title="Sí, eliminar ruta"
                      size="sm"
                      disabled={busy}
                      onPress={() => { void repository.remove(route.id).then(() => setDeleting(null)).catch(() => undefined); }}
                    />
                    <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setDeleting(null)} />
                  </>
                ) : (
                  <Button title="Eliminar ruta" size="sm" variant="soft" onPress={() => setDeleting(route.id)} />
                )}
              </View>
            }
          />
        );
      })}

      <Button title="Ver todas las rutas del catálogo" onPress={() => router.navigate('/turista/rutas-disponibles')} />
      <Button title="Crear nueva ruta en Render" variant="secondary" onPress={() => router.navigate('/turista/crear-ruta')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  couponBox: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: 4,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: 4 },
});
