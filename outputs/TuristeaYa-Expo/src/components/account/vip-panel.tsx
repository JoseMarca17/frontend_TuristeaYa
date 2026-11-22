import { useCallback } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';

export function VipPanel() {
  const session = useSession();
  const load = useCallback(async (signal: AbortSignal) => {
    const plans = await listRecords('subscription-plans', { signal });
    const subscriptions = session ? (await listRecords('subscriptions', { private: true, signal, filters: { user_id: session.user.id } })).filter(row => row.user_id === session.user.id) : [];
    const now = Date.now();
    const active = subscriptions.find(row => row.status === 'active' && Date.parse(String(row.starts_at)) <= now && Date.parse(String(row.ends_at)) > now);
    return { plans, subscriptions, active };
  }, [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  const active = data?.active;
  return <Screen title="Mi cuenta VIP" subtitle="Suscripciones y beneficios">
    {loading ? <AppText>Cargando suscripción…</AppText> : null}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
    {!loading && !error ? <AppText>{active ? `VIP activo hasta ${new Date(String(active.ends_at)).toLocaleDateString()}` : 'No hay una suscripción VIP activa en esta cuenta.'}</AppText> : null}
    {data?.plans.map(plan => <ListCard key={plan.id} title={String(plan.name)} body={`${plan.currency} ${plan.price} · ${plan.period_days} días`} />)}
    <Button title="Consultar contratación con soporte" onPress={() => router.navigate('/RamaNegocio/reportar')} />
    <Button title="Experiencias y reservas" onPress={() => router.navigate('/turista/experiencias')} />
    <Button title="Mis rutas" onPress={() => router.navigate('/turista/mis-rutas')} />
    <Button title="Mis suscripciones y reservas" onPress={() => router.navigate('/turista/cuenta')} />
    <Button title="Actualizar" disabled={loading} onPress={retry} />
  </Screen>;
}
