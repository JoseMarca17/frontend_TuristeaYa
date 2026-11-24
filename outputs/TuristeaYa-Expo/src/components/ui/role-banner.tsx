import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { DemoAccessModal } from '@/components/auth/demo-access-modal';
import { AppText } from '@/components/ui/app-text';
import { selectEffectiveRole, useAuthStore } from '@/stores/use-auth-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

const roleNames: Record<string, string> = {
  guest: 'Invitado',
  tourist: 'Turista',
  vip: 'Turista VIP',
  advertiser: 'Negocio',
  support: 'Soporte',
  admin: 'Administrador',
};

/** Banda compacta de sesión o vista demo activa. Invisible para visitantes sin sesión. */
export function RoleBanner() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const effectiveRole = useAuthStore(selectEffectiveRole);
  const [switchOpen, setSwitchOpen] = useState(false);

  const isDemo = Boolean(demoRole && !session);
  const isReal = Boolean(session);

  if (!isDemo && !isReal) {
    return null;
  }

  return (
    <>
      <View style={[styles.banner, isDemo ? styles.demoBanner : styles.realBanner]}>
        <AppText variant="caption" style={styles.title} numberOfLines={1}>
          {isDemo
            ? `Vista Demo · ${roleNames[effectiveRole]}`
            : `${profile?.full_name || session?.user.email || 'Cuenta'} · ${roleNames[effectiveRole]}`}
        </AppText>
        <View style={styles.actions}>
          {isDemo ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cambiar rol demo"
                onPress={() => setSwitchOpen(true)}
                style={styles.pillBtn}
              >
                <AppText variant="micro" color="primary" style={styles.pillText}>
                  Cambiar vista
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Salir de vista demo"
                onPress={() => {
                  void logout().then(() => router.replace('/'));
                }}
                style={styles.pillBtn}
              >
                <AppText variant="micro" color="inkSoft">
                  Salir
                </AppText>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ir a cuenta"
              onPress={() => router.navigate('/turista/perfil')}
              style={styles.pillBtn}
            >
              <AppText variant="micro" color="primary" style={styles.pillText}>
                Cuenta
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
      <DemoAccessModal visible={switchOpen} onClose={() => setSwitchOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  realBanner: {
    backgroundColor: colors.surfaceGreenSoft,
    borderColor: colors.borderGreen,
  },
  demoBanner: {
    backgroundColor: colors.highlight,
    borderColor: colors.borderHighlight,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pillBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    fontWeight: '700',
  },
});
