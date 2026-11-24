import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { CategoryPicker } from '@/features/turista/components/category-picker';
import { loadAllBackendRoutes, type BackendPlannedRoute } from '@/features/turista/data/backend-routes';
import { allCategories, categoryLabels } from '@/features/turista/data/route-planner';
import { useSelectedLocation } from '@/features/turista/location-context';
import { useRemoteData } from '@/hooks/use-remote-data';
import { createRecord, deleteRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import {
  countActiveRouteFilters,
  useRouteFilterStore,
  type RouteOrder,
  type RouteVisibilityFilter,
} from '@/stores/use-route-filter-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, fontFamilies, radius, spacing } from '@/theme';
import type { PlaceCategory } from '@/types';
import { formatDuration } from '@/utils/format';

const orderOptions: { key: RouteOrder; label: string }[] = [
  { key: 'time', label: 'Menor tiempo' },
  { key: 'cost', label: 'Menor precio' },
  { key: 'distance', label: 'Menor distancia' },
];

const visibilityOptions: { key: RouteVisibilityFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'public', label: 'Públicas' },
  { key: 'mine', label: 'Mis rutas' },
];

export default function RutasDisponiblesScreen() {
  const { location } = useSelectedLocation();
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const clearActiveCoupon = useCouponStore((s) => s.clearActiveCoupon);

  const searchQuery = useRouteFilterStore((s) => s.searchQuery);
  const categories = useRouteFilterStore((s) => s.categories);
  const maxBudget = useRouteFilterStore((s) => s.maxBudget);
  const maxMinutes = useRouteFilterStore((s) => s.maxMinutes);
  const maxDistanceKm = useRouteFilterStore((s) => s.maxDistanceKm);
  const order = useRouteFilterStore((s) => s.order);
  const visibility = useRouteFilterStore((s) => s.visibility);
  const filterModalOpen = useRouteFilterStore((s) => s.filterModalOpen);

  const setSearchQuery = useRouteFilterStore((s) => s.setSearchQuery);
  const setOrder = useRouteFilterStore((s) => s.setOrder);
  const setVisibility = useRouteFilterStore((s) => s.setVisibility);
  const setFilterModalOpen = useRouteFilterStore((s) => s.setFilterModalOpen);
  const applyFilters = useRouteFilterStore((s) => s.applyFilters);
  const resetFilters = useRouteFilterStore((s) => s.resetFilters);

  const activeFiltersCount = countActiveRouteFilters({
    categories,
    maxBudget,
    maxMinutes,
    maxDistanceKm,
    visibility,
  });

  // Draft state inside filter modal
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>(categories);
  const [draftBudget, setDraftBudget] = useState(maxBudget != null ? String(maxBudget) : '');
  const [draftMinutes, setDraftMinutes] = useState(maxMinutes != null ? String(maxMinutes) : '');
  const [draftDistance, setDraftDistance] = useState(maxDistanceKm != null ? String(maxDistanceKm) : '');
  const [draftOrder, setDraftOrder] = useState<RouteOrder>(order);
  const [draftVisibility, setDraftVisibility] = useState<RouteVisibilityFilter>(visibility);
  const [filterError, setFilterError] = useState('');

  // Create Route Modal state (POST /api/v1/routes)
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('180');
  const [newMinutes, setNewMinutes] = useState('150');
  const [newVisibility, setNewVisibility] = useState<'public' | 'private'>('private');
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(
    (signal: AbortSignal) =>
      loadAllBackendRoutes(
        {
          searchQuery,
          categories,
          maxBudget,
          maxMinutes,
          maxDistanceKm,
          order,
          visibility,
          departure: location.label,
          currentUserId: session?.user.id,
        },
        signal,
      ),
    [searchQuery, categories, maxBudget, maxMinutes, maxDistanceKm, order, visibility, location.label, session?.user.id],
  );

  const { data: results, loading, error, retry } = useRemoteData(load);
  const routes: BackendPlannedRoute[] = results ?? [];

  function openFilters() {
    setDraftCategories(categories);
    setDraftBudget(maxBudget != null ? String(maxBudget) : '');
    setDraftMinutes(maxMinutes != null ? String(maxMinutes) : '');
    setDraftDistance(maxDistanceKm != null ? String(maxDistanceKm) : '');
    setDraftOrder(order);
    setDraftVisibility(visibility);
    setFilterError('');
    setFilterModalOpen(true);
  }

  function submitFilters() {
    const parsedBudget = draftBudget.trim() ? Number(draftBudget.replace(',', '.')) : null;
    const parsedMinutes = draftMinutes.trim() ? Number(draftMinutes.replace(',', '.')) : null;
    const parsedDistance = draftDistance.trim() ? Number(draftDistance.replace(',', '.')) : null;

    if (parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setFilterError('El presupuesto debe ser 0 o mayor.');
      return;
    }
    if (parsedMinutes != null && (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0)) {
      setFilterError('Los minutos deben ser mayores que cero.');
      return;
    }
    if (parsedDistance != null && (!Number.isFinite(parsedDistance) || parsedDistance <= 0)) {
      setFilterError('La distancia máxima debe ser positiva.');
      return;
    }

    applyFilters({
      categories: draftCategories,
      maxBudget: parsedBudget,
      maxMinutes: parsedMinutes,
      maxDistanceKm: parsedDistance,
      order: draftOrder,
      visibility: draftVisibility,
    });
    setFilterModalOpen(false);
  }

  async function handleCreateRoute() {
    if (!session) {
      if (demoRole) {
        showToast('Vista Demo: inicia sesión real en Render para crear rutas persistentes.', 'info');
      } else {
        router.navigate('/login');
      }
      return;
    }
    const budgetNum = Number(newBudget.replace(',', '.'));
    const minsNum = Number(newMinutes.replace(',', '.'));
    if (!newName.trim() || !Number.isFinite(budgetNum) || budgetNum < 0 || !Number.isFinite(minsNum) || minsNum <= 0) {
      showToast('Completa un nombre, presupuesto válido y duración mayor a 0.', 'error');
      return;
    }
    setCreating(true);
    try {
      const created = await createRecord<{ id: string }>(
        'routes',
        {
          user_id: session.user.id,
          name: newName.trim(),
          budget: budgetNum,
          available_minutes: Math.round(minsNum),
          origin_lat: location.latitude ?? -16.4955,
          origin_lng: location.longitude ?? -68.1336,
          visibility: newVisibility,
        },
        'Creando ruta en Render…',
      );
      setCreateOpen(false);
      setNewName('');
      showToast('Ruta creada en Render.', 'success');
      if (created?.id) {
        router.navigate(`/turista/ruta/${created.id}`);
      } else {
        retry();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la ruta.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteRoute(routeId: string) {
    try {
      await deleteRecord('routes', routeId, 'Eliminando ruta en Render…');
      setConfirmDeleteId(null);
      showToast('Ruta eliminada de Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar la ruta.', 'error');
    }
  }

  return (
    <Screen
      title="Todas las rutas"
      subtitle={`${routes.length} ${routes.length === 1 ? 'ruta disponible' : 'rutas disponibles'} · ${location.label}`}
      rightAction={
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Crear nueva ruta"
            onPress={() => setCreateOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filtrar y ordenar rutas"
            onPress={openFilters}
            style={({ pressed }) => [
              styles.iconBtn,
              activeFiltersCount > 0 && styles.iconBtnActive,
              pressed && styles.iconBtnPressed,
            ]}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={activeFiltersCount > 0 ? colors.onPrimary : colors.primary}
            />
            {activeFiltersCount > 0 ? (
              <View style={styles.filterBadge}>
                <AppText variant="tiny" style={styles.filterBadgeText}>
                  {activeFiltersCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>
      }
    >
      {/* Buscador inline + icono rápido */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar ruta, ciudad o parada…"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
            <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir filtros"
          onPress={openFilters}
          style={styles.inlineFilterBtn}
        >
          <Ionicons name="funnel-outline" size={17} color={colors.primary} />
        </Pressable>
      </View>

      {/* Banner de cupón canjeado aplicado a rutas */}
      {activeCoupon ? (
        <View style={styles.couponBanner}>
          <View style={styles.couponBannerTop}>
            <View style={styles.couponTitleRow}>
              <Ionicons name="pricetag" size={18} color={colors.primary} />
              <AppText variant="section" style={{ flex: 1 }}>
                Cupón canjeado activo: -{activeCoupon.discountPercent}% en rutas
              </AppText>
            </View>
            <Badge label={activeCoupon.code} tone="green" />
          </View>
          <AppText variant="caption" color="inkSoft">
            {activeCoupon.title} · Descuento aplicado automáticamente sobre el presupuesto estimado de cada ruta.
          </AppText>
          <View style={styles.couponBannerActions}>
            <Button
              title="Ver detalle del canje"
              size="sm"
              variant="secondary"
              onPress={() => router.navigate('/turista/cupon-canjeado')}
            />
            <Button
              title="Quitar descuento"
              size="sm"
              variant="soft"
              onPress={clearActiveCoupon}
            />
          </View>
        </View>
      ) : null}

      {/* Filtros rápidos de visibilidad y orden */}
      <View style={styles.quickRow}>
        {visibilityOptions.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={visibility === item.key}
            onPress={() => setVisibility(item.key)}
          />
        ))}
        {activeFiltersCount > 0 ? (
          <Chip label="Limpiar filtros" selected={false} onPress={resetFilters} />
        ) : null}
      </View>

      <View style={styles.quickRow}>
        <AppText variant="micro" color="inkSoft" style={{ alignSelf: 'center', marginRight: 4 }}>
          Orden:
        </AppText>
        {orderOptions.map((opt) => (
          <Chip
            key={opt.key}
            label={opt.label}
            selected={order === opt.key}
            onPress={() => setOrder(opt.key)}
          />
        ))}
      </View>

      {loading ? <LoadingState label="Cargando todas las rutas de Render…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {!loading && !error && !routes.length ? (
        <View style={styles.emptyCard}>
          <Ionicons name="map-outline" size={28} color={colors.primary} />
          <AppText variant="section">No hay rutas con los filtros actuales</AppText>
          <AppText variant="bodySmall" color="inkSoft" style={{ textAlign: 'center' }}>
            {activeFiltersCount > 0 || searchQuery
              ? 'Quita o amplía tus filtros para volver a ver todas las rutas disponibles.'
              : 'No se encontraron rutas para mostrar en este momento.'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {activeFiltersCount > 0 || searchQuery ? (
              <Button title="Ver todas las rutas" size="sm" onPress={resetFilters} />
            ) : null}
            <Button title="Reintentar" size="sm" variant="secondary" onPress={retry} />
          </View>
        </View>
      ) : null}

      {routes.map((route) => {
        const pricing = calculateDiscountedCost(route.cost, activeCoupon);
        const isDeleting = confirmDeleteId === route.id;
        return (
          <View key={route.id} style={styles.routeCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={route.name}
              onPress={() => router.navigate(`/turista/ruta/${route.id}`)}
              style={({ pressed }) => [styles.routeCardPress, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.routeHeader}>
                <AppText variant="section" style={{ flex: 1 }}>
                  {route.name}
                </AppText>
                <Badge
                  label={route.isMine ? (route.visibility === 'private' ? 'Mi ruta privada' : 'Mi ruta pública') : 'Pública'}
                  tone={route.isMine ? 'cream' : 'green'}
                />
              </View>

              <View style={styles.metricsRow}>
                {pricing.discountPercent > 0 ? (
                  <View style={styles.priceDiscountWrap}>
                    <AppText variant="caption" style={styles.strikePrice}>
                      Bs {pricing.originalCost}
                    </AppText>
                    <AppText variant="label" style={styles.finalPrice}>
                      Bs {pricing.finalCost}
                    </AppText>
                    <Badge label={`-${pricing.discountPercent}% · Ahorras Bs ${pricing.discountAmount}`} tone="green" />
                  </View>
                ) : (
                  <View style={styles.metricPill}>
                    <Ionicons name="cash-outline" size={13} color={colors.primary} />
                    <AppText variant="caption" style={styles.metricText}>Bs {route.cost}</AppText>
                  </View>
                )}
                <View style={styles.metricPill}>
                  <Ionicons name="time-outline" size={13} color={colors.primary} />
                  <AppText variant="caption" style={styles.metricText}>{formatDuration(route.durationMin)}</AppText>
                </View>
                <View style={styles.metricPill}>
                  <Ionicons name="navigate-outline" size={13} color={colors.primary} />
                  <AppText variant="caption" style={styles.metricText}>{route.distanceKm} km</AppText>
                </View>
                <View style={styles.metricPill}>
                  <Ionicons name="flag-outline" size={13} color={colors.primary} />
                  <AppText variant="caption" style={styles.metricText}>{route.places.length} paradas</AppText>
                </View>
              </View>

              {route.places.length > 0 ? (
                <AppText variant="bodySmall" numberOfLines={2}>
                  {route.places.map((place) => place.name).join(' → ')}
                </AppText>
              ) : (
                <AppText variant="caption" color="inkSoft">
                  Ruta recién creada · Toca para agregar paradas reales.
                </AppText>
              )}

              {route.categories.length > 0 ? (
                <View style={styles.catsRow}>
                  {route.categories.map((cat) => (
                    <View key={cat} style={styles.catTag}>
                      <AppText variant="micro" color="primary">{categoryLabels[cat]}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </Pressable>

            {route.isMine ? (
              <View style={styles.ownerActions}>
                {isDeleting ? (
                  <>
                    <AppText variant="caption" style={{ flex: 1 }}>¿Eliminar esta ruta de Render?</AppText>
                    <Button title="Confirmar" size="sm" onPress={() => { void handleDeleteRoute(route.id); }} />
                    <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
                  </>
                ) : (
                  <>
                    <Button
                      title="Editar / Paradas"
                      size="sm"
                      variant="secondary"
                      onPress={() => router.navigate(`/turista/ruta/${route.id}`)}
                    />
                    <Button
                      title="Eliminar"
                      size="sm"
                      variant="soft"
                      onPress={() => setConfirmDeleteId(route.id)}
                    />
                  </>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      {/* Modal de Filtros (accionado por el icono) */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <AppText variant="title">Filtrar y ordenar rutas</AppText>
              <Pressable onPress={() => setFilterModalOpen(false)} hitSlop={8} accessibilityLabel="Cerrar filtros">
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <CategoryPicker value={draftCategories} onChange={setDraftCategories} />
              <AppText variant="micro" color="inkSoft">
                Si no seleccionas ninguna categoría, se muestran todas las rutas.
              </AppText>

              <FormField
                label="Presupuesto máximo (Bs · vacío = sin límite)"
                value={draftBudget}
                onChangeText={setDraftBudget}
                placeholder="Ej. 1000"
                keyboardType="decimal-pad"
              />
              <FormField
                label="Tiempo máximo (minutos · vacío = sin límite)"
                value={draftMinutes}
                onChangeText={setDraftMinutes}
                placeholder="Ej. 480"
                keyboardType="number-pad"
              />
              <FormField
                label="Distancia máxima (km · vacío = sin límite)"
                value={draftDistance}
                onChangeText={setDraftDistance}
                placeholder="Ej. 15"
                keyboardType="decimal-pad"
              />

              <View style={{ gap: 6 }}>
                <AppText variant="label">Visibilidad</AppText>
                <View style={styles.quickRow}>
                  {visibilityOptions.map((opt) => (
                    <Chip
                      key={opt.key}
                      label={opt.label}
                      selected={draftVisibility === opt.key}
                      onPress={() => setDraftVisibility(opt.key)}
                    />
                  ))}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <AppText variant="label">Ordenar por</AppText>
                <View style={styles.quickRow}>
                  {orderOptions.map((opt) => (
                    <Chip
                      key={opt.key}
                      label={opt.label}
                      selected={draftOrder === opt.key}
                      onPress={() => setDraftOrder(opt.key)}
                    />
                  ))}
                </View>
              </View>

              {filterError ? <AppText variant="caption" style={{ color: '#b91c1c' }}>{filterError}</AppText> : null}

              <Button title="Aplicar filtros" onPress={submitFilters} />
              <Button
                title="Limpiar filtros y ver todas"
                variant="secondary"
                onPress={() => {
                  setDraftCategories([]);
                  setDraftBudget('');
                  setDraftMinutes('');
                  setDraftDistance('');
                  setDraftOrder('time');
                  setDraftVisibility('all');
                  resetFilters();
                  setFilterModalOpen(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal para crear ruta real en Render */}
      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <AppText variant="title">Nueva ruta en Render</AppText>
              <Pressable onPress={() => setCreateOpen(false)} hitSlop={8} accessibilityLabel="Cerrar creación de ruta">
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
              {!session ? (
                <View style={styles.couponBanner}>
                  <AppText variant="bodySmall">
                    Para crear y guardar rutas en el servidor de Render necesitas iniciar sesión con una cuenta real.
                  </AppText>
                  <Button title="Ir a iniciar sesión" onPress={() => { setCreateOpen(false); router.navigate('/login'); }} />
                </View>
              ) : (
                <>
                  <FormField
                    label="Nombre de la ruta"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Ej. Circuito cultural en Sopocachi"
                  />
                  <FormField
                    label="Presupuesto estimado (Bs)"
                    value={newBudget}
                    onChangeText={setNewBudget}
                    keyboardType="decimal-pad"
                  />
                  <FormField
                    label="Duración disponible (minutos)"
                    value={newMinutes}
                    onChangeText={setNewMinutes}
                    keyboardType="number-pad"
                  />
                  <View style={{ gap: 6 }}>
                    <AppText variant="label">Visibilidad en Render</AppText>
                    <View style={styles.quickRow}>
                      <Chip label="Privada (solo yo)" selected={newVisibility === 'private'} onPress={() => setNewVisibility('private')} />
                      <Chip label="Pública (catálogo)" selected={newVisibility === 'public'} onPress={() => setNewVisibility('public')} />
                    </View>
                  </View>
                  <Button title={creating ? 'Creando…' : 'Crear ruta y añadir paradas'} disabled={creating} onPress={() => { void handleCreateRoute(); }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

export const allCategoryLabels = allCategories;

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    backgroundColor: colors.surfaceGreen,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  iconBtnPressed: {
    opacity: 0.75,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#b45309',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    color: '#fff',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 0,
  },
  inlineFilterBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceGreen,
  },
  couponBanner: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: spacing.sm,
  },
  couponBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  couponTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  couponBannerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  routeCardPress: {
    gap: spacing.sm,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metricText: {
    color: colors.ink,
  },
  priceDiscountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  strikePrice: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  finalPrice: {
    color: colors.primary,
    fontSize: 14,
  },
  catsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catTag: {
    backgroundColor: colors.surfaceGreenSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 28, 22, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.xl,
    maxHeight: '88%',
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
