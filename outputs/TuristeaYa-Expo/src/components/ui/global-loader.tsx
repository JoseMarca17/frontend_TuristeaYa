import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/app-text';
import { useNetworkStore } from '@/stores/use-network-store';
import { colors, radius, spacing } from '@/theme';

/**
 * Loader global conectado a Zustand (`useNetworkStore`).
 * - Para mutaciones (POST/PATCH/DELETE), muestra un card modal centrado no ambiguo.
 * - Para lecturas (GET) en vuelo o lentas, muestra una píldora flotante visible arriba.
 */
export function GlobalLoader() {
  const insets = useSafeAreaInsets();
  const activeCount = useNetworkStore((s) => s.activeCount);
  const mutationCount = useNetworkStore((s) => s.mutationCount);
  const activeLabel = useNetworkStore((s) => s.activeLabel);
  const isSlow = useNetworkStore((s) => s.isSlow);

  if (activeCount === 0) return null;

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

  return (
    <View
      style={[styles.topWrap, { top: Math.max(insets.top + 8, 12) }]}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={activeLabel || 'Cargando'}
    >
      <View style={[styles.pill, isSlow && styles.pillSlow]}>
        <ActivityIndicator size="small" color={isSlow ? colors.ink : colors.primary} />
        <View style={styles.pillTextWrap}>
          <AppText variant="label" style={styles.pillTitle} numberOfLines={1}>
            {activeLabel || 'Cargando datos…'}
          </AppText>
          {isSlow ? (
            <AppText variant="micro" color="inkSoft" numberOfLines={1}>
              Render está tardando un poco más de lo normal…
            </AppText>
          ) : null}
        </View>
      </View>
    </View>
  );
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
  topWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 998,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pillSlow: {
    backgroundColor: colors.highlight,
    borderColor: colors.borderHighlight,
  },
  pillTextWrap: {
    flexShrink: 1,
  },
  pillTitle: {
    color: colors.ink,
  },
});
