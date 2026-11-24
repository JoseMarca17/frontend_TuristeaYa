import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { selectEffectiveRole, useAuthStore } from '@/stores/use-auth-store';
import { colors, radius, spacing } from '@/theme';

const roleNames: Record<string, string> = {
  guest: 'Invitado (solo lectura)',
  tourist: 'Turista',
  vip: 'Turista VIP',
  advertiser: 'Negocio / Anunciante',
  support: 'Soporte técnico',
  admin: 'Administrador',
};

/** Muestra el modo actual (Render JWT real, Vista Demo o Invitado) y acceso rápido a cambiar rol. */
export function RoleBanner() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoAccount = useAuthStore((s) => s.demoAccount);
  const profile = useAuthStore((s) => s.profile);
  const effectiveRole = useAuthStore(selectEffectiveRole);

  const isDemo = Boolean(demoRole && !session);
  const isReal = Boolean(session);

  return (
    <View style={[styles.banner, isDemo ? styles.demoBanner : isReal ? styles.realBanner : styles.guestBanner]}>
      <View style={styles.left}>
        <Ionicons
          name={isDemo ? 'flask-outline' : isReal ? 'cloud-done-outline' : 'person-outline'}
          size={18}
          color={isDemo ? '#92400e' : isReal ? colors.primary : colors.inkSoft}
        />
        <View style={styles.textWrap}>
          <AppText variant="label" style={styles.title} numberOfLines={1}>
            {isDemo
              ? `Vista Demo · ${roleNames[effectiveRole]}`
              : isReal
                ? `${profile?.full_name || session?.user.email || 'Cuenta'} · ${roleNames[effectiveRole]}`
                : roleNames.guest}
          </AppText>
          <AppText variant="micro" color="inkSoft" numberOfLines={2}>
            {isDemo
              ? `Modo vista previa (${demoAccount?.email}). Para escrituras reales en Render inicia sesión con un usuario de ese rol.`
              : isReal
                ? 'Conectado a Render · POST / PATCH / DELETE habilitados según tu rol.'
                : 'Explora libremente. Inicia sesión o elige un usuario demo para guardar y editar en Render.'}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambiar cuenta o rol"
        onPress={() => router.navigate('/login')}
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      >
        <AppText variant="caption" style={styles.actionText}>
          {isReal || isDemo ? 'Cambiar' : 'Entrar'}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  realBanner: {
    backgroundColor: colors.surfaceGreen,
    borderColor: colors.borderGreen,
  },
  demoBanner: {
    backgroundColor: colors.highlight,
    borderColor: colors.borderHighlight,
  },
  guestBanner: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: colors.ink,
  },
  action: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  actionPressed: {
    backgroundColor: colors.surfaceGreenAlt,
  },
  actionText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
