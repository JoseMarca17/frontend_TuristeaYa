import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { router } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { Divider } from '@/components/ui/divider';
import { colors, radius, spacing } from '@/theme';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Muestra el botón de retroceso "‹". */
  showBack?: boolean;
  /** Acción personalizada de retroceso. */
  onBack?: () => void;
  /** Acción visual a la derecha del encabezado (por ejemplo icono de filtro). */
  rightAction?: ReactNode;
};

/** Encabezado de pantalla uniforme con botón de retorno y acción derecha opcional. */
export function ScreenHeader({ title, subtitle, showBack = true, onBack, rightAction }: ScreenHeaderProps) {
  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={styles.outer}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={goBack}
              style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
          ) : null}
          <View style={styles.titleWrap}>
            <AppText variant="title" style={styles.title} numberOfLines={1}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="subtitle" style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
        </View>
      </View>
      <Divider style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: colors.surface,
  },
  container: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    backgroundColor: colors.surfaceGreenAlt,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 21,
    lineHeight: 28,
  },
  subtitle: {
    marginTop: 2,
  },
  rightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    marginTop: 0,
  },
});
