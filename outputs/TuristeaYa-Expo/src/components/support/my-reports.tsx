import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';
import { TicketConversation } from './ticket-conversation';

const kinds = [
  ['other', 'General'],
  ['coupon', 'Cupón'],
  ['place', 'Lugar'],
  ['route', 'Ruta'],
  ['account', 'Cuenta / VIP'],
] as const;

export function MyReports({ create = false }: { create?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<(typeof kinds)[number][0]>('other');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  const load = useCallback(
    (signal: AbortSignal) =>
      session
        ? listRecords('tickets', { private: true, signal, filters: { user_id: session.user.id } })
        : Promise.resolve([]),
    [session],
  );
  const { data, loading, error, retry } = useRemoteData(load);

  async function submit() {
    if (!session || lock.current || !subject.trim() || !description.trim()) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await createRecord(
        'tickets',
        { user_id: session.user.id, subject: subject.trim(), description: description.trim(), kind },
        'Enviando reporte a Soporte…',
      );
      setSubject('');
      setDescription('');
      setNotice('Reporte enviado.');
      showToast('Reporte creado en Render.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen title={create ? 'Reportar un problema' : 'Ayuda y mis reportes'} subtitle="Seguimiento de tus consultas en Render">
      {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
      {session && create ? (
        <View style={styles.formCard}>
          <AppText variant="label">Categoría del reporte</AppText>
          <View style={styles.chipRow}>
            {kinds.map(([k, label]) => (
              <Chip key={k} label={label} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <FormField label="Asunto" value={subject} onChangeText={setSubject} maxLength={160} editable={!busy} />
          <FormField label="Descripción" value={description} onChangeText={setDescription} maxLength={4000} editable={!busy} multiline />
          <Button title="Enviar reporte (POST)" disabled={busy || !subject.trim() || !description.trim()} onPress={submit} />
        </View>
      ) : (
        <Button title="Nuevo reporte" onPress={() => router.navigate('/RamaNegocio/reportar')} />
      )}

      {loading ? <LoadingState label="Cargando reportes…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}

      {data
        ?.filter((row) => row.user_id === session?.user.id)
        .map((row) => (
          <ListCard
            key={row.id}
            title={String(row.subject)}
            body={`${row.status} · ${row.priority}\n${row.description || ''}`}
            footer={
              <>
                <Button title={selected === row.id ? 'Cerrar conversación' : 'Ver conversación'} size="sm" onPress={() => setSelected(selected === row.id ? null : row.id)} />
                {selected === row.id ? <TicketConversation key={`${session?.user.id}-${row.id}`} ticketId={row.id} /> : null}
              </>
            }
          />
        ))}
      <Button title="Actualizar" variant="secondary" disabled={loading} onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
