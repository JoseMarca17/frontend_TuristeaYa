import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '@/theme';

export interface CuponItem {
  id: string;
  titulo: string;
  local: string;
  condicion: string;
  codigo?: string;
  descuentoPct?: number;
  seleccionado?: boolean;
  usado?: boolean;
}

interface Props {
  cupon: CuponItem;
  onPress: () => void;
}

export const TarjetaCupon: React.FC<Props> = ({ cupon, onPress }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, cupon.seleccionado && styles.cardSelected]}
    >
      <View style={styles.topRow}>
        <Text style={styles.title}>{cupon.titulo}</Text>
        {cupon.descuentoPct != null && cupon.descuentoPct > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{cupon.descuentoPct}%</Text>
          </View>
        ) : null}
      </View>
      {cupon.local ? <Text style={styles.local}>{cupon.local}</Text> : null}
      <View style={styles.bottomRow}>
        {cupon.codigo ? (
          <View style={styles.codePill}>
            <Text style={styles.codeText}>{cupon.codigo}</Text>
          </View>
        ) : null}
        <Text style={styles.condicion}>{cupon.condicion}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceGreen,
    borderWidth: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  discountBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  local: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  codePill: {
    backgroundColor: colors.highlight,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  condicion: {
    flex: 1,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
