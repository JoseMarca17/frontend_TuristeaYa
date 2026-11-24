import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { useNetworkStore } from '@/stores/use-network-store';
import { colors, radius, spacing } from '@/theme';

/**
 * Loader global conectado a Zustand (`useNetworkStore`).
 * - Para mutaciones (POST/PATCH/DELETE), muestra un card modal centrado no ambiguo.
 * Las lecturas muestran su estado dentro de cada pantalla. Aquí solo se
 * bloquean mutaciones para evitar duplicar el indicador de carga de los GET.
 */
export function GlobalLoader() {
  const activeCount = useNetworkStore((s) => s.activeCount);
  const mutationCount = useNetworkStore((s) => s.mutationCount);
  const activeLabel = useNetworkStore((s) => s.activeLabel);
  const isSlow = useNetworkStore((s) => s.isSlow);

  if (activeCount === 0 || mutationCount === 0) return null;

  if (mutationCount > 0) {
    return (
      <View style={styles.overlay} pointerEvents="auto" accessibilityRole="progressbar" accessibilityLabel={activeLabel || 'Procesando'}>
        <View style={styles.modalCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="section" style={styles.modalTitle}>
            {activeLabel || 'Procesando en Render…'}
          </AppText>
          <AppText variant="caption" style={styles.modalSubtitle}>
            {isSlow
              ? 'El servidor está respondiendo, por favor espera unos segundos…'
              : 'Sincronizando operación con el servidor'}
          </AppText>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20, 35, 30, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  modalSubtitle: {
    textAlign: 'center',
    color: colors.inkSoft,
  },
});
