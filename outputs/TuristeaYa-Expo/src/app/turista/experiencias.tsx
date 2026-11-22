import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useSession } from '@/hooks/use-session';
import { listRecords } from '@/services/catalog';

export default function ExperiencesScreen() {
  const session = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const rows = await listRecords('experiences', { signal, private: !!session });
    return rows.filter(row => row.published && Date.parse(String(row.starts_at)) > Date.now());
  }, [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  return <Screen title="Experiencias" subtitle="Actividades publicadas y próximas fechas">
    {loading ? <AppText>Cargando experiencias…</AppText> : null}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    {!loading && !error && !data?.length ? <AppText>No hay experiencias próximas publicadas.</AppText> : null}
    {data?.map(row => <ListCard key={row.id} title={String(row.title)} body={`${row.description}\n${new Date(String(row.starts_at)).toLocaleString()} · Bs ${row.price_per_person} por persona${row.vip_only ? ' · Exclusiva VIP' : ''}`}
      footer={session ? <>
        <Button title="Reservar" onPress={() => setSelected(row.id)} />
        {selected === row.id ? <TransactionForm key={`${session.user.id}-${row.id}`} kind="reserve" id={row.id} unitPrice={Number(row.price_per_person)} /> : null}
      </> : <Button title="Iniciar sesión para reservar" onPress={() => router.navigate('/login')} />} />)}
    <Button title="Actualizar" disabled={loading} onPress={retry} />
    <Button title="Mis reservas" onPress={() => router.navigate('/turista/cuenta')} />
  </Screen>;
}
