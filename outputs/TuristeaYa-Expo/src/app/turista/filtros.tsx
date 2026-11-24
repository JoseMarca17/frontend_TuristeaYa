import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CategoryPicker } from '@/features/turista/components/category-picker';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';

const labels = ['Menor tiempo', 'Menor precio', 'Menor distancia'] as const;
const orders = ['time', 'cost', 'distance'] as const;

export default function FiltrosScreen() {
  const storeCategories = useRouteFilterStore((s) => s.categories);
  const storeOrder = useRouteFilterStore((s) => s.order);
  const storeDistance = useRouteFilterStore((s) => s.maxDistanceKm);
  const storeBudget = useRouteFilterStore((s) => s.maxBudget);
  const storeMinutes = useRouteFilterStore((s) => s.maxMinutes);
  const applyFilters = useRouteFilterStore((s) => s.applyFilters);
  const resetFilters = useRouteFilterStore((s) => s.resetFilters);

  const [categories, setCategories] = useState(storeCategories);
  const [order, setOrder] = useState<(typeof labels)[number]>(labels[orders.indexOf(storeOrder)]);
  const [distance, setDistance] = useState(storeDistance == null ? '' : String(storeDistance));
  const [budget, setBudget] = useState(storeBudget == null ? '' : String(storeBudget));
  const [minutes, setMinutes] = useState(storeMinutes == null ? '' : String(storeMinutes));
  const [error, setError] = useState('');

  function apply() {
    const maxDist = distance.trim() ? Number(distance.replace(',', '.')) : null;
    const maxBud = budget.trim() ? Number(budget.replace(',', '.')) : null;
    const maxMin = minutes.trim() ? Number(minutes.replace(',', '.')) : null;

    if (maxDist != null && (!Number.isFinite(maxDist) || maxDist <= 0)) {
      return setError('La distancia debe ser positiva o quedar vacía.');
    }
    if (maxBud != null && (!Number.isFinite(maxBud) || maxBud < 0)) {
      return setError('El presupuesto debe ser 0 o mayor.');
    }
    if (maxMin != null && (!Number.isFinite(maxMin) || maxMin <= 0)) {
      return setError('El tiempo debe ser mayor a cero.');
    }

    applyFilters({
      categories,
      maxBudget: maxBud,
      maxMinutes: maxMin,
      maxDistanceKm: maxDist,
      order: orders[labels.indexOf(order)],
    });
    if (router.canGoBack()) router.back();
    else router.replace('/turista/rutas-disponibles');
  }

  return (
    <Screen title="Filtros y orden" subtitle="Ajusta los resultados de rutas">
      <CategoryPicker value={categories} onChange={setCategories} />
      <SegmentedControl label="Ordenar por" options={labels} value={order} onChange={setOrder} />
      <FormField label="Presupuesto máximo (Bs; vacío = sin límite)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" />
      <FormField label="Tiempo máximo (minutos; vacío = sin límite)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <FormField label="Distancia máxima (km; vacío = sin límite)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" />
      {error ? <AppText variant="caption" style={{ color: '#b91c1c' }}>{error}</AppText> : null}
      <Button title="Aplicar filtros" onPress={apply} />
      <Button
        title="Limpiar filtros y ver todas"
        variant="secondary"
        onPress={() => {
          resetFilters();
          if (router.canGoBack()) router.back();
          else router.replace('/turista/rutas-disponibles');
        }}
      />
    </Screen>
  );
}
