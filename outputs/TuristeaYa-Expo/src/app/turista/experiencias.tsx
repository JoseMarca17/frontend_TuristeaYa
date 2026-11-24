import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { spacing } from '@/theme';

export default function ExperiencesScreen() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const demoExperiences = useDemoStore((s) => s.experiences);
  const addDemoReservation = useDemoStore((s) => s.addReservation);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'vip'>('all');

  const load = useCallback(async (signal: AbortSignal): Promise<(CatalogRow & { _upcoming: boolean })[]> => {
    const rows = await listRecords('experiences', { signal, private: Boolean(session) }).catch(() => []);
    const merged = isDemo ? [...demoExperiences, ...rows] : rows;
    const seen = new Set<string>();
    const dedup = merged.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const now = Date.now();
    return dedup
      .filter((row) => row.published !== false)
      .map((row) => ({ ...row, _upcoming: Date.parse(String(row.starts_at)) > now }));
  }, [session, isDemo, demoExperiences]);

  const { data, loading, error, retry } = useRemoteData(load);
  const visible = (data ?? []).filter((row) => {
    if (filter === 'upcoming') return Boolean(row._upcoming);
    if (filter === 'vip') return Boolean(row.vip_only);
    return true;
  });

  return (
    <Screen title="Experiencias" subtitle="Actividades publicadas y reservas">
      <RoleBanner />
      <View style={styles.filterRow}>
        <Chip label="Todas" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Próximas" selected={filter === 'upcoming'} onPress={() => setFilter('upcoming')} />
        <Chip label="Exclusivas VIP" selected={filter === 'vip'} onPress={() => setFilter('vip')} />
      </View>

      {loading ? <LoadingState label="Cargando experiencias…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {!loading && !error && !visible.length ? (
        <AppText variant="bodySmall">No hay experiencias en este filtro. Prueba seleccionando «Todas».</AppText>
      ) : null}

      {visible.map((row) => (
        <ListCard
          key={row.id}
          title={String(row.title)}
          body={`${row.description}\n${new Date(String(row.starts_at)).toLocaleString()} · Bs ${row.price_per_person}/persona · Cupos: ${row.capacity ?? '—'}`}
          footer={
            <View style={{ gap: spacing.xs + 2, marginTop: 4 }}>
              <View style={styles.badgeRow}>
                {row.vip_only ? <Badge label="Exclusiva VIP" tone="cream" /> : null}
                <Badge label={row._upcoming ? 'Disponible' : 'Fecha pasada'} tone={row._upcoming ? 'green' : 'cream'} />
              </View>
              {session || demoRole ? (
                <>
                  <Button
                    title={selected === row.id ? 'Cerrar reserva' : row._upcoming ? 'Reservar' : 'No disponible'}
                    size="sm"
                    disabled={!row._upcoming}
                    onPress={() => setSelected(selected === row.id ? null : row.id)}
                  />
                  {selected === row.id && row._upcoming ? (
                    <TransactionForm
                      key={`${session?.user.id || demoRole}-${row.id}`}
                      kind="reserve"
                      id={row.id}
                      unitPrice={Number(row.price_per_person)}
                      onSuccess={(_res, people) => {
                        if (isDemo) {
                          addDemoReservation({
                            id: `demo-res-${Date.now()}`,
                            experience_id: row.id,
                            title: String(row.title),
                            participants: people,
                            total: people * Number(row.price_per_person || 0),
                            status: 'confirmada',
                            created_at: new Date().toISOString(),
                          });
                        }
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <Button title="Iniciar sesión para reservar" size="sm" onPress={() => router.navigate('/login')} />
              )}
            </View>
          }
        />
      ))}

      <Button title="Actualizar" variant="secondary" disabled={loading} onPress={retry} />
      <Button title="Mis reservas en Mi cuenta" variant="soft" onPress={() => router.navigate('/turista/cuenta')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
});
