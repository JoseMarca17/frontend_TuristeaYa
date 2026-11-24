import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import {
  buildCouponNotificationMetadata,
  classifyCouponApiError,
  validateCouponBeforeRedeem,
} from '@/services/domain-rules';
import { createRecord } from '@/services/management';
import { transact } from '@/services/transactions';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const quickAmounts = ['50', '100', '200'];

export type PromotionRuleInput = {
  code?: string | null;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  per_user_limit?: number | null;
  conditions?: string | null;
};

export function TransactionForm({
  kind,
  id,
  unitPrice,
  discountPercent,
  promo,
  userRedemptionsCount = 0,
  onSuccess,
}: {
  kind: 'reserve' | 'redeem';
  id: string;
  unitPrice?: number;
  discountPercent?: number;
  promo?: PromotionRuleInput | null;
  userRedemptionsCount?: number;
  onSuccess?: (result: unknown, amountOrPeople: number) => void;
}) {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const [value, setValue] = useState(kind === 'reserve' ? '1' : '100');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const lock = useRef(false);
  const number = Number(value.replace(',', '.'));

  const estimatedSavings =
    kind === 'redeem' && Number.isFinite(number) && number > 0 && discountPercent != null
      ? Math.round(number * (discountPercent / 100) * 100) / 100
      : null;

  async function emitStructuredCouponNotification(payload: {
    redemptionId?: string;
    errCode?: string;
    errReason?: string;
    severity: 'info' | 'warning' | 'error';
  }) {
    if (!session || kind !== 'redeem') return;
    const meta = buildCouponNotificationMetadata({
      promotion_id: id,
      redemption_id: payload.redemptionId,
      error_code: payload.errCode,
      error_reason: payload.errReason,
      severity: payload.severity,
    });
    // Persistir notificación estructurada si RLS lo permite; no bloquear la transacción principal si falla.
    await createRecord(
      'notifications',
      {
        user_id: session.user.id,
        title: payload.errCode ? `Error de canje: ${payload.errCode}` : 'Cupón canjeado y notificado al comercio',
        body: `${payload.errReason || 'Canje verificado'} · ${JSON.stringify(meta)}`,
      },
      'Registrando notificación de canje…',
    ).catch(() => {});
  }

  async function confirm() {
    if (lock.current || done) return;
    if (kind === 'reserve') {
      if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) {
        setNotice('Indica un número entero de participantes.');
        return;
      }
    } else if (promo) {
      const check = validateCouponBeforeRedeem(promo, number, userRedemptionsCount);
      if (!check.ok) {
        setErrorCode(check.code);
        setNotice(`${check.code}: ${check.reason}`);
        showToast(check.reason, 'error');
        void emitStructuredCouponNotification({
          errCode: check.code,
          errReason: check.reason,
          severity: check.severity,
        });
        return;
      }
    } else if (!Number.isFinite(number) || number <= 0) {
      setErrorCode('MIN_AMOUNT_NOT_MET');
      setNotice('MIN_AMOUNT_NOT_MET: Importe de compra insuficiente (indica un monto mayor que cero).');
      return;
    }

    lock.current = true;
    setBusy(true);
    setNotice('');
    setErrorCode(null);
    try {
      let result: unknown;
      if (!session && demoRole) {
        result = {
          id: `demo-${Date.now()}`,
          savings: estimatedSavings ?? 0,
          redeemed_at: new Date().toISOString(),
          isDemo: true,
        };
      } else {
        result = await transact(kind, id, number);
      }
      setDone(true);
      const redemptionId =
        result && typeof result === 'object' && 'id' in result ? String((result as { id: unknown }).id) : undefined;
      if (kind === 'redeem' && session) {
        void emitStructuredCouponNotification({
          redemptionId,
          errReason: `Canje aplicado por Bs ${number}`,
          severity: 'info',
        });
      }
      const msg =
        kind === 'reserve'
          ? 'Reserva confirmada. Consulta los detalles en Mi cuenta.'
          : 'Cupón canjeado';
      setNotice(msg);
      showToast(msg, 'success');
      onSuccess?.(result, number);
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : 'No se pudo confirmar.';
      if (kind === 'redeem') {
        const classified = classifyCouponApiError(rawMsg);
        setErrorCode(classified.code);
        setNotice(`${classified.code}: ${classified.reason}`);
        showToast(classified.reason, 'error');
        void emitStructuredCouponNotification({
          errCode: classified.code,
          errReason: classified.reason,
          severity: classified.severity,
        });
      } else {
        setNotice(rawMsg);
        showToast(rawMsg, 'error');
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      <FormField
        label={kind === 'reserve' ? 'Participantes' : 'Importe de compra (Bs)'}
        keyboardType={kind === 'reserve' ? 'number-pad' : 'decimal-pad'}
        value={value}
        onChangeText={setValue}
        editable={!busy && !done}
      />
      {kind === 'redeem' && !done ? (
        <View style={styles.quickRow}>
          {quickAmounts.map((amt) => (
            <Chip
              key={amt}
              label={`Bs ${amt}`}
              selected={value === amt}
              onPress={() => setValue(amt)}
            />
          ))}
        </View>
      ) : null}
      {kind === 'reserve' && Number.isFinite(number) && unitPrice != null ? (
        <AppText variant="label" color="primary">
          Total estimado: Bs {(number * unitPrice).toFixed(2)}
        </AppText>
      ) : null}
      {estimatedSavings != null ? (
        <AppText variant="label" color="primary">
          Descuento estimado ({discountPercent}%): ahorras Bs {estimatedSavings.toFixed(2)}
        </AppText>
      ) : null}
      {notice ? (
        <View style={{ gap: 4 }}>
          {errorCode ? <Badge label={errorCode} tone="cream" /> : null}
          <AppText accessibilityRole="alert" variant="label" style={{ color: done ? colors.primary : '#b91c1c' }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      <Button
        title={
          busy
            ? 'Confirmando…'
            : done
              ? kind === 'redeem'
                ? 'Cupón canjeado'
                : 'Confirmado'
              : kind === 'reserve'
                ? 'Confirmar reserva'
                : 'Confirmar canje'
        }
        disabled={busy || done || !value.trim()}
        onPress={confirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
});
