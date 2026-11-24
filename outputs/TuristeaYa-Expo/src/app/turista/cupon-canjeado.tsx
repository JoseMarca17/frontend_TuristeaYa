import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { QrCodeView } from '@/components/ui/qr-code';
import { loadAllBackendRoutes } from '@/features/turista/data/backend-routes';
import { useRemoteData } from '@/hooks/use-remote-data';
import { buildCouponVerificationCode } from '@/services/domain-rules';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { calculateDiscountedCost, useCouponStore } from '@/stores/use-coupon-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useRouteFilterStore } from '@/stores/use-route-filter-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

/**
 * Pantalla destino tras canjear un cupón:
 * confirma "Cupón canjeado", genera QR verificable, permite disputar y muestra el descuento aplicado en rutas.
 */
export default function CuponCanjeadoScreen() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const addDemoTicket = useDemoStore((s) => s.addTicket);
  const activeCoupon = useCouponStore((s) => s.activeCoupon);
  const redemptions = useCouponStore((s) => s.redemptions);
  const showToast = useUiStore((s) => s.showToast);
  const coupon = activeCoupon ?? redemptions[0] ?? null;

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [disputeBusy, setDisputeBusy] = useState(false);

  const loadRoutes = useCallback(
    (signal: AbortSignal) =>
      loadAllBackendRoutes({ currentUserId: session?.user.id, order: 'cost' }, signal),
    [session?.user.id],
  );
  const { data: routes, loading, error, retry } = useRemoteData(loadRoutes);

  async function submitCouponDispute() {
    if (!coupon || !disputeText.trim() || disputeBusy) return;
    if (isDemo) {
      addDemoTicket({
        id: `demo-tk-${Date.now()}`,
        user_id: `demo-${demoRole}`,
        redemption_id: coupon.id,
        kind: 'coupon',
        priority: 'high',
        status: 'pending',
        subject: `Disputa de cupón ${coupon.code}`,
        description: disputeText.trim(),
        created_at: new Date().toISOString(),
      });
      setDisputeText('');
      setDisputeOpen(false);
      showToast('Disputa registrada para revisión de Soporte.', 'success');
      return;
    }
    if (!session) {
      router.navigate('/login');
      return;
    }
    setDisputeBusy(true);
    try {
      await createRecord(
        'tickets',
        {
          user_id: session.user.id,
          redemption_id: coupon.isDemo ? null : coupon.id,
          kind: 'coupon',
          priority: 'high',
          subject: `Disputa de cupón ${coupon.code}`,
          description: disputeText.trim(),
        },
        'Enviando disputa de canje…',
      );
      setDisputeText('');
      setDisputeOpen(false);
      showToast('Disputa enviada a Soporte.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo abrir la disputa.', 'error');
    } finally {
      setDisputeBusy(false);
    }
  }

  if (!coupon) {
    return (
      <Screen title="Cupón canjeado" subtitle="Aún no has seleccionado un cupón">
        <View style={styles.emptyCard}>
          <Ionicons name="pricetag-outline" size={32} color={colors.primary} />
          <AppText variant="section">Canjea un cupón para aplicar tu descuento</AppText>
          <AppText variant="bodySmall" color="inkSoft" style={{ textAlign: 'center' }}>
            Elige cualquier cupón disponible, confirma tu canje y vuelve aquí para ver el QR verificable y el descuento en rutas.
          </AppText>
          <Button title="Ir a cupones" onPress={() => router.replace('/turista/cupones')} />
        </View>
      </Screen>
    );
  }

  const verificationCode = buildCouponVerificationCode(coupon.promotionId, coupon.code, coupon.id);

  return (
    <Screen title="Cupón canjeado" subtitle="Comprobante QR verificable y descuento aplicado en rutas">
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

        <QrCodeView value={verificationCode} caption={`Muestra este QR al comercio · ${verificationCode}`} />

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
        <Button
          title={disputeOpen ? 'Cancelar disputa' : '¿Problema en el local? Abrir disputa'}
          size="sm"
          variant="secondary"
          onPress={() => setDisputeOpen((v) => !v)}
        />
        {disputeOpen ? (
          <View style={styles.disputeCard}>
            <AppText variant="label">Disputa de canje con Soporte</AppText>
            <FormField
              label="¿Qué sucedió al presentar el cupón?"
              placeholder="Ej. El comercio no reconoció el código QR o el descuento fue distinto…"
              value={disputeText}
              onChangeText={setDisputeText}
              multiline
            />
            <Button
              title={session || isDemo ? (disputeBusy ? 'Enviando…' : 'Enviar disputa') : 'Inicia sesión para disputar'}
              size="sm"
              disabled={disputeBusy}
              onPress={() => {
                if (!session && !isDemo) router.navigate('/login');
                else void submitCouponDispute();
              }}
            />
          </View>
        ) : null}
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
            style={({ pressed }) => [styles.routeCard, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.routeTop}>
              <AppText variant="section" style={{ flex: 1 }}>
                {route.name}
              </AppText>
              <Badge label={`-${pricing.discountPercent}%`} tone="green" />
            </View>
            <View style={styles.priceRow}>
              <AppText variant="caption" style={styles.strike}>
                Bs {pricing.originalCost}
              </AppText>
              <AppText variant="section" color="primary">
                Bs {pricing.finalCost}
              </AppText>
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                (ahorras Bs {pricing.discountAmount})
              </AppText>
            </View>
            <AppText variant="caption" color="inkSoft">
              {formatDuration(route.durationMin)} · {route.distanceKm} km · {route.places.length} paradas
            </AppText>
          </Pressable>
        );
      })}

      <Button title="Volver a mis cupones" variant="secondary" onPress={() => router.navigate('/turista/cupones')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  successHero: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  heroIconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    textAlign: 'center',
    color: colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    gap: 2,
  },
  disputeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHead: {
    gap: 2,
  },
  routeCard: {
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  strike: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
});
