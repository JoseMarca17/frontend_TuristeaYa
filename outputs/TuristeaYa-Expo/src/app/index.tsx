import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RoleBanner } from '@/components/ui/role-banner';
import { DEMO_ACCOUNTS, GUEST_ROLE_INFO, type DemoAccount } from '@/services/demo-accounts';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const roleIcons: Record<DemoAccount['key'], keyof typeof Ionicons.glyphMap> = {
  tourist: 'walk-outline',
  vip: 'diamond-outline',
  advertiser: 'storefront-outline',
  support: 'chatbubbles-outline',
  admin: 'shield-checkmark-outline',
};

/** Entrada principal: accesos rápidos, roles, diferencias y usuarios demo. */
export default function RoleSelectorScreen() {
  const [expandedRole, setExpandedRole] = useState<string | null>('tourist');
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const loginDemoOnRender = useAuthStore((s) => s.loginDemoOnRender);
  const enterDemoPreview = useAuthStore((s) => s.enterDemoPreview);
  const showToast = useUiStore((s) => s.showToast);

  async function tryDemoRender(account: DemoAccount) {
    if (busyRole) return;
    setBusyRole(account.key);
    try {
      const result = await loginDemoOnRender(account.key);
      if (result.ok) {
        showToast(result.message, 'success');
        router.navigate(account.routeTarget as Href);
      } else {
        showToast(result.message, 'info');
      }
    } finally {
      setBusyRole(null);
    }
  }

  function openDemoPreview(account: DemoAccount) {
    enterDemoPreview(account.key);
    showToast(`Vista demo activada: ${account.title}`, 'info');
    router.navigate(account.routeTarget as Href);
  }

  return (
    <Screen title="TuristeaYA" subtitle="Explora rutas, cupones y gestión por rol" showBack={false} extraEdges={['bottom']}>
      <RoleBanner />

      <View style={styles.hero}>
        <AppText variant="title" style={styles.heroTitle}>
          Planifica tu salida en segundos
        </AppText>
        <AppText variant="bodySmall" style={styles.heroBody}>
          Visualiza todas las rutas reales al instante, filtra con un toque, canjea cupones con descuento directo en rutas y opera el backend de Render según tu rol.
        </AppText>
        <View style={styles.heroActions}>
          <Button title="Ver todas las rutas" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          <Button title="Ir al inicio turista" variant="secondary" onPress={() => router.navigate('/turista')} />
          <Button title="Iniciar sesión / Registro" variant="soft" onPress={() => router.navigate('/login')} />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <AppText variant="section">Roles, diferencias y usuarios demo</AppText>
        <AppText variant="caption" color="inkSoft">
          Toca cualquier rol para ver qué operaciones POST, PATCH y DELETE soporta en Render, su ejemplo de acceso y entrar con un clic.
        </AppText>
      </View>

      {/* Invitado */}
      <View style={styles.roleCard}>
        <View style={styles.roleHeader}>
          <View style={styles.roleTitleRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="compass-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="section">{GUEST_ROLE_INFO.title}</AppText>
              <AppText variant="micro" color="inkSoft">{GUEST_ROLE_INFO.roleLabel}</AppText>
            </View>
          </View>
          <Badge label="Solo lectura" tone="cream" />
        </View>
        <AppText variant="bodySmall">{GUEST_ROLE_INFO.summary}</AppText>
        {GUEST_ROLE_INFO.differences.map((diff) => (
          <AppText key={diff} variant="caption" style={styles.bullet}>• {diff}</AppText>
        ))}
        <Button title="Explorar como invitado" variant="secondary" size="sm" onPress={() => router.navigate('/turista/rutas-disponibles')} />
      </View>

      {/* 5 Roles con cuentas demo */}
      {DEMO_ACCOUNTS.map((account) => {
        const expanded = expandedRole === account.key;
        const isBusy = busyRole === account.key;
        return (
          <View key={account.key} style={styles.roleCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedRole(expanded ? null : account.key)}
              style={styles.roleHeader}
            >
              <View style={styles.roleTitleRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name={roleIcons[account.key]} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="section">{account.title}</AppText>
                  <AppText variant="micro" color="inkSoft">{account.roleLabel}</AppText>
                </View>
              </View>
              <View style={styles.rightHeader}>
                <Badge label={account.badge} tone={account.key === 'vip' ? 'cream' : 'green'} />
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
              </View>
            </Pressable>

            <AppText variant="bodySmall">{account.summary}</AppText>

            <View style={styles.credBox}>
              <AppText variant="micro" style={styles.credLine}>
                Correo ejemplo: <AppText variant="label">{account.email}</AppText>
              </AppText>
              <AppText variant="micro" style={styles.credLine}>
                Contraseña demo: <AppText variant="label">{account.password}</AppText>
              </AppText>
            </View>

            {expanded ? (
              <View style={styles.details}>
                <AppText variant="label">Diferencias clave:</AppText>
                {account.differences.map((diff) => (
                  <AppText key={diff} variant="caption" style={styles.bullet}>• {diff}</AppText>
                ))}
                <AppText variant="label" style={{ marginTop: 4 }}>Operaciones en Render:</AppText>
                {account.renderOperations.map((op) => (
                  <AppText key={op} variant="micro" color="inkSoft" style={styles.bullet}>→ {op}</AppText>
                ))}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title={isBusy ? 'Conectando…' : 'Entrar en Render'}
                  size="sm"
                  disabled={Boolean(busyRole)}
                  onPress={() => { void tryDemoRender(account); }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Vista Demo"
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(busyRole)}
                  onPress={() => openDemoPreview(account)}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir módulo ${account.title}`}
                onPress={() => router.navigate(account.routeTarget as Href)}
                style={styles.goIconBtn}
              >
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  heroBody: {
    color: colors.ink,
  },
  heroActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    gap: 2,
    marginTop: spacing.xs,
  },
  roleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  credBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.sm,
    gap: 2,
  },
  credLine: {
    color: colors.inkSoft,
  },
  details: {
    gap: 4,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  bullet: {
    paddingLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  goIconBtn: {
    width: 31,
    height: 31,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    backgroundColor: colors.surfaceGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
