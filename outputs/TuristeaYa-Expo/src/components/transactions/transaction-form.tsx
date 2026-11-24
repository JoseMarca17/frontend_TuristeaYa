import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { transact } from '@/services/transactions';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const quickAmounts = ['50', '100', '200'];

export function TransactionForm({
  kind,
  id,
  unitPrice,
  discountPercent,
  onSuccess,
}: {
  kind: 'reserve' | 'redeem';
  id: string;
  unitPrice?: number;
  discountPercent?: number;
  onSuccess?: (result: unknown, amountOrPeople: number) => void;
}) {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const [value, setValue] = useState(kind === 'reserve' ? '1' : '100');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const number = Number(value.replace(',', '.'));

  const estimatedSavings =
    kind === 'redeem' && Number.isFinite(number) && number > 0 && discountPercent != null
      ? Math.round(number * (discountPercent / 100) * 100) / 100
      : null;

  async function confirm() {
    if (lock.current || done) return;
    if (!Number.isFinite(number) || number <= 0 || (kind === 'reserve' && !Number.isInteger(number))) {
      setNotice(
        kind === 'reserve'
          ? 'Indica un número entero de participantes.'
          : 'Indica un importe mayor que cero.',
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setNotice('');
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
      const msg =
        kind === 'reserve'
          ? 'Reserva confirmada. Consulta los detalles en Mi cuenta.'
          : 'Cupón canjeado';
      setNotice(msg);
      showToast(msg, 'success');
      onSuccess?.(result, number);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo confirmar.';
      setNotice(msg);
      showToast(msg, 'error');
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
        <AppText accessibilityRole="alert" variant="label" style={{ color: done ? colors.primary : '#b91c1c' }}>
          {notice}
        </AppText>
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
