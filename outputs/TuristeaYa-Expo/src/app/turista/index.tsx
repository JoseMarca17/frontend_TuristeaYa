import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { RoleBanner } from '@/components/ui/role-banner';
import { RecommendationCarousel } from '@/features/turista/components/recommendation-carousel';
import { RouteStatus } from '@/features/turista/components/route-status';
import { loadAllBackendRoutes } from '@/features/turista/data/backend-routes';
import { outingNotices } from '@/features/turista/data/discovery';
import { allCategories, categoryLabels } from '@/features/turista/data/route-planner';
import { useDiscovery } from '@/features/turista/discovery-context';
import { useSelectedLocation } from '@/features/turista/location-context';
import { useRoutes } from '@/features/turista/route-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';
import { colors, radius, spacing } from '@/theme';
import type { PlaceCategory } from '@/types';
import { formatDuration } from '@/utils/format';

export default function InicioScreen() {
  const { location } = useSelectedLocation();
  const { readNotices } = useDiscovery();
  const { routes } = useRoutes();
  const session = useAuthStore((s) => s.session);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const resetFilters = useRouteFilterStore((s) => s.resetFilters);
  const applyFilters = useRouteFilterStore((s) => s.applyFilters);
  const setFilterModalOpen = useRouteFilterStore((s) => s.setFilterModalOpen);

  const loadPreview = useCallback(
    (signal: AbortSignal) =>
      loadAllBackendRoutes({ currentUserId: session?.user.id, order: 'time' }, signal),
    [session?.user.id],
  );
  const { data: previewRoutes, loading } = useRemoteData(loadPreview);

  const unreadCount = outingNotices.filter((notice) => !readNotices.includes(notice.id)).length;

  function openAllRoutes(openFilter = false) {
    resetFilters();
    setFilterModalOpen(openFilter);
    router.navigate('/turista/rutas-disponibles');
  }

  function openCategory(cat: PlaceCategory) {
    applyFilters({
      categories: [cat],
      maxBudget: null,
      maxMinutes: null,
      maxDistanceKm: null,
      order: 'time',
      visibility: 'all',
    });
    setFilterModalOpen(false);
    router.navigate('/turista/rutas-disponibles');
  }

  return (
    <Screen
      title="Inicio"
      subtitle={location.label === 'Centro de La Paz' ? 'La Paz · Centro' : location.label}
      rightAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filtrar rutas"
          onPress={() => openAllRoutes(true)}
          style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="options-outline" size={20} color={colors.primary} />
        </Pressable>
      }
    >
      <RoleBanner />

      {/* Cupón canjeado activo si existe */}
      {activeCoupon ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/turista/cupon-canjeado')}
          style={styles.couponActiveCard}
        >
          <View style={styles.rowBetween}>
            <View style={styles.rowGap}>
              <Ionicons name="pricetag" size={18} color={colors.primary} />
              <AppText variant="section">Cupón canjeado: -{activeCoupon.discountPercent}%</AppText>
            </View>
            <Badge label={activeCoupon.code} tone="green" />
          </View>
          <AppText variant="caption" color="inkSoft">
            {activeCoupon.title} · Toca para ver las rutas con tu descuento aplicado.
          </AppText>
        </Pressable>
      ) : null}

      {/* Hero directo para ver todas las rutas en 1 toque */}
      <View style={styles.heroCard}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <AppText variant="section">Explora todas las rutas</AppText>
            <AppText variant="caption" color="inkSoft">
              {loading
                ? 'Sincronizando rutas desde Render…'
                : `${previewRoutes?.length ?? 0} rutas disponibles listas para recorrer`}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir filtros de rutas"
            onPress={() => openAllRoutes(true)}
            style={styles.filterChipBtn}
          >
            <Ionicons name="funnel-outline" size={16} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.heroBtnRow}>
          <View style={{ flex: 1 }}>
            <Button title="Ver todas las rutas" onPress={() => openAllRoutes(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Crear ruta" variant="secondary" onPress={() => router.navigate('/turista/crear-ruta')} />
          </View>
        </View>
        <View style={styles.catRow}>
          {allCategories.map((cat) => (
            <Pressable
              key={cat}
              accessibilityRole="button"
              onPress={() => openCategory(cat)}
              style={({ pressed }) => [styles.catPill, pressed && { backgroundColor: colors.surfaceGreenAlt }]}
            >
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                {categoryLabels[cat]}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Vista previa de rutas reales */}
      {previewRoutes && previewRoutes.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.rowBetween}>
            <AppText variant="section">Rutas destacadas</AppText>
            <Pressable onPress={() => openAllRoutes(false)}>
              <AppText variant="action">Ver todas →</AppText>
            </Pressable>
          </View>
          {previewRoutes.slice(0, 3).map((route) => {
            const pricing = calculateDiscountedCost(route.cost, activeCoupon);
            return (
              <ListCard
                key={route.id}
                title={route.name}
                body={`${
                  pricing.discountPercent > 0
                    ? `Bs ${pricing.finalCost} (antes Bs ${pricing.originalCost}, -${pricing.discountPercent}%)`
                    : `Bs ${route.cost}`
                } · ${formatDuration(route.durationMin)} · ${route.places.length} paradas`}
                onPress={() => router.navigate(`/turista/ruta/${route.id}`)}
              />
            );
          })}
        </View>
      ) : null}

      {/* Accesos rápidos del turista */}
      <AppText variant="section">Explorar y gestionar</AppText>
      <View style={styles.grid}>
        <QuickTile
          icon="location-outline"
          title="Ubicación"
          subtitle={location.label}
          onPress={() => router.navigate('/turista/ubicacion')}
        />
        <QuickTile
          icon="compass-outline"
          title="Lugares"
          subtitle="Catálogo y mapas"
          onPress={() => router.navigate('/turista/catalogo')}
        />
        <QuickTile
          icon="pricetag-outline"
          title="Cupones"
          subtitle="Canjea descuentos"
          onPress={() => router.navigate('/turista/cupones')}
        />
        <QuickTile
          icon="sparkles-outline"
          title="Experiencias"
          subtitle="Actividades y reservas"
          onPress={() => router.navigate('/turista/experiencias')}
        />
        <QuickTile
          icon="notifications-outline"
          title="Mi cuenta"
          subtitle="Reservas, tickets, avisos"
          onPress={() => router.navigate('/turista/cuenta')}
        />
        <QuickTile
          icon="construct-outline"
          title="Herramientas"
          subtitle="GPS, cámara, QR"
          onPress={() => router.navigate('/turista/herramientas' as Href)}
        />
      </View>

      <ListCard
        title="Avisos de mi salida"
        body={unreadCount ? `${unreadCount} avisos sin leer · Revisa las novedades.` : 'Estás al día · Ver avisos.'}
        onPress={() => router.navigate('/turista/notificaciones')}
      />
      <RecommendationCarousel />
      <RouteStatus />

      {routes.length ? <AppText variant="section">Mis rutas guardadas en este dispositivo</AppText> : null}
      {routes.slice(0, 3).map((route) => (
        <ListCard
          key={route.id}
          title={route.name}
          body={`${route.placeIds.length} paradas · ${formatDuration(route.durationMin)} aprox.${route.visited ? ' · Visitada' : ''}`}
          onPress={() => router.navigate(`/turista/ruta/${route.id}`)}
        />
      ))}
      <Button title="Ir a Mis rutas" variant="secondary" onPress={() => router.navigate('/turista/mis-rutas')} />
    </Screen>
  );
}

function QuickTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.surfaceGreen }]}
    >
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <AppText variant="label" numberOfLines={1}>{title}</AppText>
      <AppText variant="micro" color="inkSoft" numberOfLines={1}>{subtitle}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceGreen,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponActiveCard: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: 4,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChipBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceGreen,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  catPill: {
    backgroundColor: colors.surfaceGreen,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
