import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderCupones } from "../../components/Jose/HeaderCupones";
import { EstadoCupon, TabsEstado } from "../../components/Jose/TabsEstado";
import { TarjetaCupon } from "../../components/Jose/TarjetaCupon";
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { TransactionForm } from '@/components/transactions/transaction-form';

export default function PantallaCupones() {
  const session = useSession();
  const [estado, setEstado] = useState<EstadoCupon>("disponibles");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    if (estado === 'usados') {
      if (!session) return [];
      return (await listRecords('coupon-redemptions', { signal, private: true, filters: { user_id: session.user.id } }))
        .filter((row) => row.user_id === session.user.id)
        .map((row) => ({ id: row.id, titulo: 'Cupón canjeado', local: `Ahorro: Bs ${row.savings}`, condicion: String(row.redeemed_at || row.created_at || '') }));
    }
    const [promotions, places] = await Promise.all([listRecords('promotions', { signal }), listRecords('places', { signal })]);
    return promotions.filter((row) => row.status === 'active' && Date.parse(String(row.starts_at)) <= Date.now() && Date.parse(String(row.ends_at)) > Date.now())
      .map((row) => ({ id: row.id, titulo: String(row.title), local: String(places.find((place) => place.id === row.place_id)?.name || ''),
        condicion: [row.code, row.conditions, `Descuento: ${row.discount_percent}%`].filter(Boolean).join(' · ') }));
  }, [estado, session]);
  const { data: cupones, loading, error, retry } = useRemoteData(load);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <HeaderCupones onBack={() => router.canGoBack() ? router.back() : router.replace("/turista")} />

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <TabsEstado filtroActivo={estado} alCambiar={setEstado} />

        {loading ? <Text style={styles.footerNote}>Cargando cupones…</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.footerNote}>{error}</Text> : null}
        {estado === 'usados' && !session ? <Button title="Iniciar sesión para ver mis canjes" onPress={() => router.navigate('/login')} /> : null}
        {!loading && !error && !cupones?.length ? <Text style={styles.footerNote}>No hay cupones en esta sección.</Text> : null}
        {cupones?.map((item) => (
          <TarjetaCupon
            key={item.id}
            cupon={{ ...item, seleccionado: selected === item.id }}
            onPress={() => setSelected(item.id)}
          />
        ))}
        {estado === 'disponibles' && selected && cupones?.some(item => item.id === selected) ? session
          ? <TransactionForm key={`${session.user.id}-${selected}`} kind="redeem" id={selected} />
          : <Button title="Iniciar sesión para canjear" onPress={() => router.navigate('/login')} /> : null}
        <Button title="Actualizar" disabled={loading} onPress={retry} />

        <Text style={styles.footerNote}>
          Revisa las condiciones antes de confirmar el canje.
        </Text>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  footerNote: {
    marginHorizontal: 20,
    marginTop: 10,
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
});
