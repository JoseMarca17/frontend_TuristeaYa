import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';
import { AppText } from './app-text';
import { borderWidth, colors, radius, spacing } from '@/theme';

type QrMatrixProps = {
  value: string;
  size?: number;
  caption?: string;
};

export function QrCodeView({ value, size = 148, caption }: QrMatrixProps) {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(value || 'TYA-VOUCHER', { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const cells: boolean[][] = [];
      for (let r = 0; r < count; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < count; c++) {
          row.push(Boolean(qr.modules.get(r, c)));
        }
        cells.push(row);
      }
      return { count, cells };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <View style={styles.fallback}>
        <AppText variant="caption" color="inkSoft">
          Código verificable: {value}
        </AppText>
      </View>
    );
  }

  const moduleSize = Math.max(2, Math.floor(size / matrix.count));
  const exactBox = moduleSize * matrix.count;

  return (
    <View style={styles.wrapper} accessibilityRole="image" accessibilityLabel={`Código QR verificable ${value}`}>
      <View style={[styles.qrFrame, { width: exactBox + 16, height: exactBox + 16 }]}>
        <View style={{ width: exactBox, height: exactBox }}>
          {matrix.cells.map((row, rIndex) => (
            <View key={rIndex} style={styles.row}>
              {row.map((dark, cIndex) => (
                <View
                  key={cIndex}
                  style={{
                    width: moduleSize,
                    height: moduleSize,
                    backgroundColor: dark ? colors.ink : colors.surface,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      <AppText variant="caption" color="inkSoft" style={styles.codeLabel}>
        {caption || value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: spacing.xs },
  qrFrame: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  codeLabel: { textAlign: 'center', fontFamily: 'monospace' },
  fallback: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
});
