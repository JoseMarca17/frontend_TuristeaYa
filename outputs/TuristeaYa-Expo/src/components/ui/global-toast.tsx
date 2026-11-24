import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/app-text';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export function GlobalToast() {
  const insets = useSafeAreaInsets();
  const toast = useUiStore((s) => s.toast);
  const clearToast = useUiStore((s) => s.clearToast);

  if (!toast) return null;

  const isError = toast.tone === 'error';
  const isSuccess = toast.tone === 'success';
  const iconName = isError ? 'alert-circle' : isSuccess ? 'checkmark-circle' : 'information-circle';
  const iconColor = isError ? '#b91c1c' : isSuccess ? colors.primary : '#0369a1';

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom + 72, 80) }]} pointerEvents="box-none">
      <Pressable
        onPress={clearToast}
        accessibilityRole="alert"
        style={[
          styles.toast,
          isError ? styles.error : isSuccess ? styles.success : styles.info,
        ]}
      >
        <Ionicons name={iconName} size={20} color={iconColor} />
        <AppText variant="bodySmall" style={styles.text}>
          {toast.message}
        </AppText>
        <Ionicons name="close" size={16} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 997,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 440,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  success: {
    backgroundColor: colors.surfaceGreen,
    borderColor: colors.borderGreen,
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  info: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  text: {
    flex: 1,
    color: colors.ink,
  },
});
