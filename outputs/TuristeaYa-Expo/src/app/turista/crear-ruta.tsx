import { useState } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { CategoryPicker } from '@/features/turista/components/category-picker';
import { zonePoints } from '@/features/turista/data/discovery';
import { useSelectedLocation } from '@/features/turista/location-context';
import { useRoutes } from '@/features/turista/route-context';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export default function CrearRutaScreen() {
  const { criteria, setCriteria } = useRoutes();
  const { location } = useSelectedLocation();
  const session = useAuthStore((s) => s.session);
  const applyFilters = useRouteFilterStore((s) => s.applyFilters);
  const showToast = useUiStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [budget, setBudget] = useState(String(criteria.budget));
  const [minutes, setMinutes] = useState(String(criteria.minutes));
  const [categories, setCategories] = useState(criteria.categories);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function validateNumbers() {
    const maxBudget = Number(budget.replace(',', '.'));
    const maxMinutes = Number(minutes.replace(',', '.'));
    const origin =
      location.latitude != null && location.longitude != null
        ? { latitude: location.latitude, longitude: location.longitude }
        : zonePoints[location.label] ?? { latitude: -16.4955, longitude: -68.1336 };

    if (!budget.trim() || !Number.isFinite(maxBudget) || maxBudget < 0) {
      setError('Escribe un presupuesto válido, desde Bs 0.');
      return null;
    }
    if (!minutes.trim() || !Number.isFinite(maxMinutes) || maxMinutes <= 0) {
      setError('Escribe un tiempo disponible mayor que cero.');
      return null;
    }
    return { maxBudget, maxMinutes, origin };
  }

  function searchExisting() {
    const parsed = validateNumbers();
    if (!parsed) return;
    setError('');
    setCriteria({
      categories: categories.length ? categories : ['cultura'],
      budget: parsed.maxBudget,
      minutes: parsed.maxMinutes,
      origin: parsed.origin,
      departure: location.label,
      order: 'time',
      maxDistance: null,
    });
    applyFilters({
      categories,
      maxBudget: parsed.maxBudget,
      maxMinutes: parsed.maxMinutes,
      maxDistanceKm: null,
      order: 'time',
      visibility: 'all',
    });
    router.navigate('/turista/rutas-disponibles');
  }

  async function createInRender() {
    if (!session) {
      router.navigate('/login');
      return;
    }
    if (!name.trim()) {
      setError('Escribe un nombre para guardar la nueva ruta en Render.');
      return;
    }
    const parsed = validateNumbers();
    if (!parsed) return;
    setBusy(true);
    setError('');
    try {
      const created = await createRecord<{ id: string }>(
        'routes',
        {
          user_id: session.user.id,
          name: name.trim(),
          budget: parsed.maxBudget,
          available_minutes: Math.round(parsed.maxMinutes),
          origin_lat: parsed.origin.latitude,
          origin_lng: parsed.origin.longitude,
          visibility,
        },
        'Creando ruta en Render…',
      );
      showToast('Ruta creada en Render. Ahora puedes agregar paradas.', 'success');
      if (created?.id) router.replace(`/turista/ruta/${created.id}`);
      else router.replace('/turista/rutas-disponibles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la ruta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Crear o buscar ruta" subtitle="Crea tu ruta en Render o filtra rutas existentes">
      <View style={styles.card}>
        <AppText variant="section">Crear nueva ruta en tu cuenta</AppText>
        <FormField
          label="Nombre de tu ruta"
          placeholder="Ej. Mi tarde por Sopocachi y Miradores"
          value={name}
          onChangeText={setName}
        />
        <FormField
          label="Presupuesto estimado (Bs)"
          keyboardType="decimal-pad"
          value={budget}
          onChangeText={setBudget}
        />
        <FormField
          label="Tiempo disponible (minutos)"
          keyboardType="number-pad"
          value={minutes}
          onChangeText={setMinutes}
        />
        <View style={{ gap: 6 }}>
          <AppText variant="label">Visibilidad</AppText>
          <View style={styles.row}>
            <Chip label="Privada" selected={visibility === 'private'} onPress={() => setVisibility('private')} />
            <Chip label="Pública" selected={visibility === 'public'} onPress={() => setVisibility('public')} />
          </View>
        </View>
        <CategoryPicker value={categories} onChange={setCategories} />
        <AppText variant="label">Punto de partida: {location.label}</AppText>
        <Button title="Cambiar punto de partida" variant="secondary" size="sm" onPress={() => router.navigate('/turista/ubicacion')} />
        {error ? <AppText variant="bodySmall" style={{ color: '#b91c1c' }} accessibilityLiveRegion="polite">{error}</AppText> : null}
        <Button
          title={session ? (busy ? 'Creando en Render…' : 'Crear ruta en Render') : 'Inicia sesión para crear en Render'}
          disabled={busy}
          onPress={() => { void createInRender(); }}
        />
        <Button title="Buscar rutas existentes con estos límites" variant="secondary" onPress={searchExisting} />
      </View>
      <Button title="Ver todas las rutas sin filtros" variant="soft" onPress={() => {
        useRouteFilterStore.getState().resetFilters();
        router.navigate('/turista/rutas-disponibles');
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
