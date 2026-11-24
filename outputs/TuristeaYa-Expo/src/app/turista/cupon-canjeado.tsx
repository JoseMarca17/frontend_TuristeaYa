import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { loadAllBackendRoutes } from '@/features/turista/data/backend-routes';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';
import { colors, radius, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

/**
 * Pantalla destino tras canjear un cupón:
 * confirma "Cupón canjeado" y muestra el descuento aplicado en las rutas.
 */
export default function CuponCanjeadoScreen() {
  const session = useAuthStore((s) => s.session);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const redemptions = useCouponStore((s) => s.redemptions);
  const coupon = activeCoupon ?? redemptions[0] ?? null;

  const loadRoutes = useCallback(
    (signal: AbortSignal) =>
      loadAllBackendRoutes({ currentUserId: session?.user.id, order: 'cost' }, signal),
    [session?.user.id],
  );
  const { data: routes, loading, error, retry } = useRemoteData(loadRoutes);

  if (!coupon) {
    return (
      <Screen title="Cupón canjeado" subtitle="Aún no has seleccionado un cupón">
        <View style={styles.emptyCard}>
          <Ionicons name="pricetag-outline" size={32} color={colors.primary} />
          <AppText variant="section">Canjea un cupón para aplicar tu descuento</AppText>
          <AppText variant="bodySmall" color="inkSoft" style={{ textAlign: 'center' }}>
            Elige cualquier cupón disponible, confirma tu canje y vuelve aquí para ver todas las rutas con tu descuento aplicado.
          </AppText>
          <Button title="Ir a cupones" onPress={() => router.replace('/turista/cupones')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Cupón canjeado" subtitle="Tu descuento ya está aplicado en rutas">
      <View style={styles.successHero}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="checkmark-circle" size={40} color={colors.primary} />
        </View>
        <AppText variant="title" style={styles.heroTitle}>
          Cupón canjeado
        </AppText>
        <AppText variant="section" style={{ textAlign: 'center' }}>
          {coupon.title}
        </AppText>
        <View style={styles.badgeRow}>
          <Badge label={`Código: ${coupon.code}`} tone="cream" />
          <Badge label={`-${coupon.discountPercent}% de descuento`} tone="green" />
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <AppText variant="micro" color="inkSoft">Ahorro del canje</AppText>
            <AppText variant="section" color="primary">Bs {coupon.savings.toFixed(2)}</AppText>
          </View>
          <View style={styles.summaryBox}>
            <AppText variant="micro" color="inkSoft">Comercio</AppText>
            <AppText variant="label" numberOfLines={1}>{coupon.placeName || 'Aliado'}</AppText>
          </View>
        </View>
        {coupon.isDemo ? (
          <AppText variant="micro" color="inkSoft" style={{ textAlign: 'center' }}>
            Canje registrado en Vista Demo local.
          </AppText>
        ) : null}
        <Button
          title="Explorar todas las rutas con descuento"
          onPress={() => {
            useRouteFilterStore.getState().resetFilters();
            router.navigate('/turista/rutas-disponibles');
          }}
        />
      </View>

      <View style={styles.sectionHead}>
        <AppText variant="section">Descuento de tu cupón aplicado en rutas</AppText>
        <AppText variant="caption" color="inkSoft">
          Cada ruta muestra su presupuesto original y el total con -{coupon.discountPercent}% aplicado ({coupon.code}).
        </AppText>
      </View>

      {loading ? <LoadingState label="Calculando descuento en las rutas…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {routes?.map((route) => {
        const pricing = calculateDiscountedCost(route.cost, coupon);
        return (
          <Pressable
            key={route.id}
            accessibilityRole="button"
            onPress={() => router.navigate(`/turista/ruta/${route.id}`)}
            style={({ pressed }) => [styles.routeDiscountCard, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.routeTop}>
              <AppText variant="section" style={{ flex: 1 }}>{route.name}</AppText>
              <Badge label={`-${pricing.discountPercent}%`} tone="green" />
            </View>
            <View style={styles.priceCompareRow}>
              <AppText variant="bodySmall" style={styles.strike}>
                Antes: Bs {pricing.originalCost}
              </AppText>
              <AppText variant="section" color="primary">
                Ahora: Bs {pricing.finalCost}
              </AppText>
              <AppText variant="caption" style={styles.savingsText}>
                (Ahorras Bs {pricing.discountAmount})
              </AppText>
            </View>
            <AppText variant="caption" color="inkSoft">
              {formatDuration(route.durationMin)} · {route.distanceKm} km · {route.places.length} paradas
            </AppText>
          </Pressable>
        );
      })}

      <Button title="Volver a cupones" variant="secondary" onPress={() => router.navigate('/turista/cupones')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  successHero: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginVertical: spacing.xs,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  sectionHead: {
    gap: 2,
    marginTop: spacing.xs,
  },
  routeDiscountCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: 6,
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priceCompareRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  strike: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  savingsText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
