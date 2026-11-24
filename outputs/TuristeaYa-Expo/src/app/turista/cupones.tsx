import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EstadoCupon, TabsEstado } from '@/components/Jose/TabsEstado';
import { CuponItem, TarjetaCupon } from '@/components/Jose/TarjetaCupon';
import { Screen } from '@/components/layout/screen';
import { TransactionForm, type PromotionRuleInput } from '@/components/transactions/transaction-form';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { useAuthStore } from '@/stores/use-auth-store';
import { useCouponStore, type RedeemedCoupon } from '@/stores/use-coupon-store';
import { colors, radius, spacing } from '@/theme';

type PromoMeta = {
  row: CatalogRow;
  placeName: string;
  discountPercent: number;
  code: string;
  title: string;
};

export default function PantallaCupones() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const localRedemptions = useCouponStore((s) => s.redemptions);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const recordRedemption = useCouponStore((s) => s.recordRedemption);
  const setActiveCoupon = useCouponStore((s) => s.setActiveCoupon);

  const [estado, setEstado] = useState<EstadoCupon>('disponibles');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    const [promotions, places] = await Promise.all([
      listRecords('promotions', { signal }),
      listRecords('places', { signal }),
    ]);

    const placeMap = new Map(places.map((p) => [p.id, String(p.name || '')]));
    const promoMetaMap = new Map<string, PromoMeta>();
    for (const row of promotions) {
      promoMetaMap.set(row.id, {
        row,
        placeName: placeMap.get(String(row.place_id)) || 'Comercio aliado',
        discountPercent: Number(row.discount_percent ?? 0),
        code: String(row.code || ''),
        title: String(row.title || 'Promoción'),
      });
    }

    if (estado === 'usados') {
      if (!session && !demoRole) return { items: [] as (CuponItem & { redeemedObj?: RedeemedCoupon })[], promos: promoMetaMap };
      if (!session && demoRole) {
        const items = localRedemptions.map((item) => ({
          id: item.id,
          titulo: item.title,
          local: `${item.placeName} · Ahorro: Bs ${item.savings}`,
          condicion: `Canjeado: ${new Date(item.redeemedAt).toLocaleDateString()}`,
          codigo: item.code,
          descuentoPct: item.discountPercent,
          usado: true,
          redeemedObj: item,
        }));
        return { items, promos: promoMetaMap };
      }

      const redemptions = (
        await listRecords('coupon-redemptions', {
          signal,
          private: true,
          filters: { user_id: session!.user.id },
        })
      ).filter((row) => row.user_id === session!.user.id);

      const items = redemptions.map((row) => {
        const promo = promoMetaMap.get(String(row.promotion_id));
        const redeemedObj: RedeemedCoupon = {
          id: row.id,
          promotionId: String(row.promotion_id || ''),
          code: promo?.code || 'CUPON',
          title: promo?.title || 'Cupón canjeado',
          placeName: promo?.placeName || 'Comercio aliado',
          discountPercent: promo?.discountPercent || 15,
          purchaseAmount: Number(row.savings || 0) * 5,
          savings: Number(row.savings || 0),
          redeemedAt: String(row.redeemed_at || row.created_at || new Date().toISOString()),
          ownerId: session!.user.id,
        };
        return {
          id: row.id,
          titulo: promo?.title || 'Cupón canjeado',
          local: `${promo?.placeName || 'Comercio'} · Ahorro: Bs ${row.savings}`,
          condicion: String(row.redeemed_at || row.created_at || '').slice(0, 16).replace('T', ' '),
          codigo: promo?.code,
          descuentoPct: promo?.discountPercent,
          usado: true,
          redeemedObj,
        };
      });
      return { items, promos: promoMetaMap };
    }

    const now = Date.now();
    const items: (CuponItem & { discountPercent: number; placeName: string; code: string })[] = promotions
      .filter(
        (row) =>
          row.status === 'active' &&
          Date.parse(String(row.starts_at)) <= now &&
          Date.parse(String(row.ends_at)) > now,
      )
      .map((row) => {
        const placeName = placeMap.get(String(row.place_id)) || 'La Paz · Comercio aliado';
        const discountPercent = Number(row.discount_percent ?? 0);
        const code = String(row.code || '');
        return {
          id: row.id,
          titulo: String(row.title),
          local: placeName,
          condicion: [row.conditions, `Vence: ${String(row.ends_at).slice(0, 10)}`].filter(Boolean).join(' · '),
          codigo: code,
          descuentoPct: discountPercent,
          discountPercent,
          placeName,
          code,
        };
      });
    return { items, promos: promoMetaMap };
  }, [estado, session, demoRole, localRedemptions]);

  const { data, loading, error, retry } = useRemoteData(load);
  const cupones = data?.items ?? [];
  const selectedPromo = cupones.find((item) => item.id === selected);

  function handleRedeemSuccess(result: unknown, purchaseAmount: number) {
    if (!selectedPromo) return;
    const record = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
    const discountPercent = Number(selectedPromo.descuentoPct ?? 20);
    const savings =
      record.savings != null && Number.isFinite(Number(record.savings))
        ? Number(record.savings)
        : Math.round(purchaseAmount * (discountPercent / 100) * 100) / 100;

    recordRedemption({
      id: String(record.id || `redemption-${Date.now()}`),
      promotionId: selectedPromo.id,
      code: selectedPromo.codigo || 'CUPON',
      title: selectedPromo.titulo,
      placeName: selectedPromo.local,
      discountPercent,
      purchaseAmount,
      savings,
      redeemedAt: String(record.redeemed_at || new Date().toISOString()),
      ownerId: session?.user.id || `demo-${demoRole || 'guest'}`,
      isDemo: !session && Boolean(demoRole),
    });

    router.push('/turista/cupon-canjeado');
  }

  return (
    <Screen title="Mis cupones" subtitle="Canjea descuentos y aplícalos a tus rutas">
      <RoleBanner />

      {activeCoupon ? (
        <View style={styles.activeCard}>
          <AppText variant="label" color="primary">
            Cupón canjeado activo: {activeCoupon.title} (-{activeCoupon.discountPercent}%)
          </AppText>
          <Button
            title="Ver descuento aplicado en rutas"
            size="sm"
            onPress={() => router.navigate('/turista/cupon-canjeado')}
          />
        </View>
      ) : null}

      <TabsEstado filtroActivo={estado} alCambiar={(next) => { setEstado(next); setSelected(null); }} />

      {loading ? <LoadingState label="Cargando cupones desde Render…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {estado === 'usados' && !session && !demoRole ? (
        <Button title="Iniciar sesión para ver mis canjes" onPress={() => router.navigate('/login')} />
      ) : null}

      {!loading && !error && !cupones.length ? (
        <View style={styles.emptyCard}>
          <AppText variant="bodySmall" color="inkSoft">
            No hay cupones en esta sección.
          </AppText>
        </View>
      ) : null}

      {cupones.map((item) => (
        <View key={item.id}>
          <TarjetaCupon
            cupon={{ ...item, seleccionado: selected === item.id }}
            onPress={() => setSelected(selected === item.id ? null : item.id)}
          />
          {estado === 'disponibles' && selected === item.id ? (
            session || demoRole ? (
              <View style={{ marginBottom: spacing.md }}>
                <TransactionForm
                  key={`${session?.user.id || demoRole}-${item.id}`}
                  kind="redeem"
                  id={item.id}
                  discountPercent={item.descuentoPct}
                  promo={data?.promos.get(item.id)?.row as PromotionRuleInput | undefined}
                  userRedemptionsCount={localRedemptions.filter((r) => r.promotionId === item.id).length}
                  onSuccess={handleRedeemSuccess}
                />
              </View>
            ) : (
              <View style={{ marginBottom: spacing.md }}>
                <Button title="Iniciar sesión para canjear" onPress={() => router.navigate('/login')} />
              </View>
            )
          ) : null}
          {estado === 'usados' && 'redeemedObj' in item && item.redeemedObj ? (
            <View style={{ marginBottom: spacing.md }}>
              <Button
                title="Aplicar este descuento en rutas"
                size="sm"
                variant="secondary"
                onPress={() => {
                  setActiveCoupon(item.redeemedObj!);
                  router.push('/turista/cupon-canjeado');
                }}
              />
            </View>
          ) : null}
        </View>
      ))}

      <Button title="Actualizar cupones" variant="secondary" disabled={loading} onPress={retry} />
      <AppText variant="caption" color="inkSoft">
        Al confirmar el canje verás «Cupón canjeado» y pasarás a la vista con tu descuento aplicado en rutas.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeCard: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
});
