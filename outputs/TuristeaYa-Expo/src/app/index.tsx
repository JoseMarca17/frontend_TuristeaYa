import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DemoAccessModal } from '@/components/auth/demo-access-modal';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { RoleBanner } from '@/components/ui/role-banner';
import { borderWidth, colors, radius, spacing } from '@/theme';

const highlights: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  {
    icon: 'map-outline',
    title: 'Rutas a tu medida',
    detail: 'Arma recorridos según tu tiempo, presupuesto y punto de partida.',
  },
  {
    icon: 'pricetag-outline',
    title: 'Cupones verificables',
    detail: 'Canjea descuentos con QR y aplícalos directo en tus rutas.',
  },
  {
    icon: 'compass-outline',
    title: 'Lugares y reseñas',
    detail: 'Horarios, distancias, opiniones de otros viajeros y mapa del trayecto.',
  },
];

/** Pantalla principal limpia y directa. */
export default function HomeWelcomeScreen() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <Screen title="TuristeaYA" subtitle="La Paz · Guía de rutas y lugares" showBack={false} extraEdges={['bottom']}>
      <RoleBanner />

      <View style={styles.hero}>
        <AppText variant="title" style={styles.heroTitle}>
          Organiza tu recorrido en minutos
        </AppText>
        <AppText variant="bodySmall" color="inkSoft">
          Descubre qué visitar hoy según tu presupuesto, distancia y preferencias.
        </AppText>
        <View style={styles.heroActions}>
          <Button title="Explorar rutas" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          <View style={styles.rowBtns}>
            <View style={{ flex: 1 }}>
              <Button title="Inicio turista" variant="secondary" onPress={() => router.navigate('/turista')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Iniciar sesión" variant="soft" onPress={() => router.navigate('/login')} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.highlightsCard}>
        {highlights.map((item, idx) => (
          <View key={item.title} style={[styles.highlightRow, idx > 0 && styles.highlightDivider]}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{item.title}</AppText>
              <AppText variant="caption" color="inkSoft">
                {item.detail}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {/* Acceso demo discreto en la parte inferior */}
      <View style={styles.footerDemoWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir acceso demo"
          hitSlop={10}
          onPress={() => setDemoOpen(true)}
          style={({ pressed }) => [styles.discreetDemoBtn, pressed && { opacity: 0.85 }]}
        >
          <AppText variant="micro" style={styles.discreetDemoText}>
            · demo ·
          </AppText>
        </Pressable>
      </View>

      <DemoAccessModal visible={demoOpen} onClose={() => setDemoOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm + 2,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  heroActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rowBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  highlightsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  highlightDivider: {
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.borderSoft,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDemoWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  discreetDemoBtn: {
    opacity: 0.42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  discreetDemoText: {
    fontSize: 11,
    color: colors.inkMuted,
    letterSpacing: 0.8,
  },
});
