import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { colors, radius, spacing } from '@/theme';

export function LoadingState({
  label = 'Cargando desde Render…',
  hint = 'Si el servidor estaba en reposo, la primera respuesta puede tardar unos segundos.',
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="small" color={colors.primary} />
      <AppText variant="section" style={styles.title}>{label}</AppText>
      <AppText variant="caption" style={styles.hint}>{hint}</AppText>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <AppText variant="section" style={styles.errorTitle}>No se pudo completar la carga</AppText>
      <AppText variant="bodySmall" style={styles.errorBody}>{message}</AppText>
      {onRetry ? <Button title="Reintentar" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  title: {
    textAlign: 'center',
    color: colors.ink,
  },
  hint: {
    textAlign: 'center',
    color: colors.inkSoft,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorTitle: { color: '#991b1b' },
  errorBody: { color: '#7f1d1d' },
});
