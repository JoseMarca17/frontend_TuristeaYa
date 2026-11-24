import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ScreenHeader, type ScreenHeaderProps } from './screen-header';

import { colors, spacing } from '@/theme';

type ScreenProps = Pick<ScreenHeaderProps, 'title' | 'subtitle' | 'showBack' | 'onBack' | 'rightAction'> & {
  children: ReactNode;
  /** Envuelve el contenido en un ScrollView. */
  scroll?: boolean;
  /** Padding horizontal de 20. */
  padded?: boolean;
  /** Bordes seguros extra: usar "bottom" en pantallas sin barra de pestañas. */
  extraEdges?: Edge[];
};

/**
 * Estructura base de pantalla: área segura + encabezado + contenido centrado y adaptable.
 */
export function Screen({
  title,
  subtitle,
  showBack,
  onBack,
  rightAction,
  children,
  scroll = true,
  padded = true,
  extraEdges = [],
}: ScreenProps) {
  const edges: Edge[] = ['top', ...extraEdges];
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      {title ? (
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          showBack={showBack}
          onBack={onBack}
          rightAction={rightAction}
        />
      ) : null}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.scrollContent, padded && styles.padded]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inner}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.scrollContent, padded && styles.padded]}>
            <View style={[styles.inner, styles.fill]}>{children}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 12,
  },
  padded: { paddingHorizontal: spacing.lg },
  inner: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: spacing.md,
  },
});
