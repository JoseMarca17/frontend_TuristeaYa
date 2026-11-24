import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';
import { TicketConversation } from './ticket-conversation';

const kinds = [
  ['other', 'General / Lugar'],
  ['coupon', 'Disputa de cupón'],
  ['review', 'Reporte de reseña'],
  ['route', 'Ruta'],
  ['account', 'Cuenta / VIP'],
] as const;

const priorities = ['low', 'medium', 'high'] as const;

const priorityLabels: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export function MyReports({ create = false }: { create?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const demoTickets = useDemoStore((s) => s.tickets);
  const addDemoTicket = useDemoStore((s) => s.addTicket);
  const showToast = useUiStore((s) => s.showToast);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<(typeof kinds)[number][0]>('other');
  const [priority, setPriority] = useState<(typeof priorities)[number]>('medium');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  const load = useCallback(
    (signal: AbortSignal) => {
      if (isDemo) return Promise.resolve(demoTickets);
      return session
        ? listRecords('tickets', { private: true, signal, filters: { user_id: session.user.id } })
        : Promise.resolve([]);
    },
    [session, isDemo, demoTickets],
  );
  const { data, loading, error, retry } = useRemoteData(load);

  async function submit() {
    if ((!session && !isDemo) || lock.current || !subject.trim() || !description.trim()) return;
    if (isDemo) {
      addDemoTicket({
        id: `demo-tk-${Date.now()}`,
        user_id: `demo-${demoRole}`,
        subject: subject.trim(),
        description: description.trim(),
        kind,
        priority,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      setSubject('');
      setDescription('');
      setNotice('Reporte enviado a soporte.');
      showToast('Reporte creado.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await createRecord(
        'tickets',
        {
          user_id: session!.user.id,
          subject: subject.trim(),
          description: description.trim(),
          kind,
          priority,
        },
        'Enviando reporte…',
      );
      setSubject('');
      setDescription('');
      setNotice('Reporte enviado a soporte.');
      showToast('Reporte enviado.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const visibleRows = isDemo
    ? demoTickets
    : (data ?? []).filter((row) => row.user_id === session?.user.id);

  return (
    <Screen title={create ? 'Reportar un problema' : 'Ayuda y mis reportes'} subtitle="Seguimiento de tus consultas y disputas">
      {!session && !isDemo ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
      {(session || isDemo) && create ? (
        <View style={styles.formCard}>
          <AppText variant="label">Tipo de caso</AppText>
          <View style={styles.chipRow}>
            {kinds.map(([k, label]) => (
              <Chip key={k} label={label} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <AppText variant="label">Prioridad</AppText>
          <View style={styles.chipRow}>
            {priorities.map((p) => (
              <Chip key={p} label={priorityLabels[p] || p} selected={priority === p} onPress={() => setPriority(p)} />
            ))}
          </View>
          <FormField label="Asunto" value={subject} onChangeText={setSubject} maxLength={160} editable={!busy} />
          <FormField label="Descripción detallada" value={description} onChangeText={setDescription} maxLength={4000} editable={!busy} multiline />
          <Button title="Enviar reporte" disabled={busy || !subject.trim() || !description.trim()} onPress={submit} />
        </View>
      ) : (
        <Button title="Nuevo reporte" onPress={() => router.navigate('/RamaNegocio/reportar')} />
      )}

      {loading ? <LoadingState label="Cargando reportes…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}

      {visibleRows.map((row) => (
        <ListCard
          key={row.id}
          title={String(row.subject)}
          body={`${row.kind || 'other'} · Prioridad: ${priorityLabels[String(row.priority)] || row.priority}\n${row.description || ''}`}
          footer={
            <View style={{ gap: 6, marginTop: 4 }}>
              <Badge label={String(row.status || 'pending')} tone={row.status === 'resolved' ? 'green' : 'cream'} />
              <Button title={selected === row.id ? 'Cerrar conversación' : 'Ver conversación'} size="sm" onPress={() => setSelected(selected === row.id ? null : row.id)} />
              {selected === row.id ? <TicketConversation key={`${session?.user.id || 'demo'}-${row.id}`} ticketId={row.id} isDemo={isDemo} /> : null}
            </View>
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
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
