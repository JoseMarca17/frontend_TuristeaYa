import { useRef, useState } from 'react';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { transact } from '@/services/transactions';

export function TransactionForm({ kind, id, unitPrice, onSuccess }: {
  kind: 'reserve' | 'redeem'; id: string; unitPrice?: number; onSuccess?: () => void;
}) {
  const [value, setValue] = useState(kind === 'reserve' ? '1' : '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const number = Number(value.replace(',', '.'));
  async function confirm() {
    if (lock.current || done) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      await transact(kind, id, number);
      setDone(true);
      setNotice(kind === 'reserve' ? 'Reserva confirmada. Consulta los detalles en Mi cuenta.' : 'Cupón canjeado. Consulta el historial en Usados.');
      onSuccess?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo confirmar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <FormField label={kind === 'reserve' ? 'Participantes' : 'Importe de compra (Bs)'} keyboardType={kind === 'reserve' ? 'number-pad' : 'decimal-pad'}
      value={value} onChangeText={setValue} editable={!busy && !done} />
    {kind === 'reserve' && Number.isFinite(number) && unitPrice != null ? <AppText>Total: Bs {(number * unitPrice).toFixed(2)}</AppText> : null}
    {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
    <Button title={busy ? 'Confirmando…' : done ? 'Confirmado' : kind === 'reserve' ? 'Confirmar reserva' : 'Confirmar canje'} disabled={busy || done || !value.trim()} onPress={confirm} />
  </>;
}
