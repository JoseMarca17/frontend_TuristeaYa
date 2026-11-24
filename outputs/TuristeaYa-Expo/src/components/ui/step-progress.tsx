import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { borderWidth, colors, radius, spacing } from '@/theme';

export function StepProgressBar({
  steps,
  currentStep,
  onSelectStep,
}: {
  steps: string[];
  currentStep: number;
  onSelectStep?: (stepIndex: number) => void;
}) {
  const safeStep = Math.max(0, Math.min(steps.length - 1, currentStep));
  const progressPct = Math.round(((safeStep + 1) / Math.max(1, steps.length)) * 100);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: steps.length, now: safeStep + 1 }}
      accessibilityLabel={`Paso ${safeStep + 1} de ${steps.length}: ${steps[safeStep] || ''}`}
    >
      <View style={styles.topRow}>
        <AppText variant="label" color="primary">
          Paso {safeStep + 1} de {steps.length}: {steps[safeStep]}
        </AppText>
        <AppText variant="caption" color="inkMuted">
          {progressPct}%
        </AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progressPct}%` }]} />
      </View>
      <View style={styles.pills}>
        {steps.map((label, index) => {
          const active = index === safeStep;
          const completed = index < safeStep;
          return (
            <Pressable
              key={label}
              disabled={!onSelectStep}
              onPress={() => onSelectStep?.(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Ir al paso ${index + 1}: ${label}`}
              style={[styles.pill, active && styles.pillActive, completed && styles.pillCompleted]}
            >
              <AppText variant="caption" color={active ? 'onPrimary' : completed ? 'primary' : 'inkSoft'}>
                {index + 1}. {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.surfaceGreenSoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 99,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderAlt,
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillCompleted: {
    backgroundColor: colors.surfaceGreenSoft,
    borderColor: colors.primary,
  },
});
