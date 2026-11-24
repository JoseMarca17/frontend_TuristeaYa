import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import type { DemoRoleKey } from '@/services/demo-accounts';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

const demoOptions: {
  key: DemoRoleKey;
  title: string;
  subtitle: string;
  target: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'tourist',
    title: 'Turista',
    subtitle: 'Explorar rutas, crear recorridos, reseñar y canjear cupones',
    target: '/turista',
    icon: 'walk-outline',
  },
  {
    key: 'vip',
    title: 'Turista VIP',
    subtitle: 'Sin anuncios, rutas extendidas, reservas exclusivas y descargas offline',
    target: '/vip',
    icon: 'diamond-outline',
  },
  {
    key: 'advertiser',
    title: 'Comercio / Negocio',
    subtitle: 'Gestionar local, wizard de alta, promociones, reseñas y campañas',
    target: '/RamaNegocio',
    icon: 'storefront-outline',
  },
  {
    key: 'support',
    title: 'Soporte',
    subtitle: 'Atender tickets, disputas de cupones e historial de usuarios',
    target: '/soporte',
    icon: 'chatbubbles-outline',
  },
  {
    key: 'admin',
    title: 'Administrador',
    subtitle: 'Métricas generales, permisos, moderación y verificación de comercios',
    target: '/admin',
    icon: 'shield-checkmark-outline',
  },
];

export function DemoAccessModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const enterDemoPreview = useAuthStore((s) => s.enterDemoPreview);
  const currentDemoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  function chooseRole(item: (typeof demoOptions)[number]) {
    enterDemoPreview(item.key);
    onClose();
    showToast(`Vista demo: ${item.title}`, 'info');
    router.replace(item.target as Href);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <AppText variant="title" style={{ fontSize: 18 }}>
                Vista demo
              </AppText>
              <AppText variant="caption" color="inkSoft">
                Elige un perfil para probar todas las funciones sin registro
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cerrar selector demo"
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {demoOptions.map((item) => {
              const active = currentDemoRole === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Entrar en vista demo ${item.title}`}
                  onPress={() => chooseRole(item)}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="section">{item.title}</AppText>
                    <AppText variant="caption" color="inkSoft">
                      {item.subtitle}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                </Pressable>
              );
            })}
          </ScrollView>

          <Button title="Cerrar" variant="secondary" size="sm" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 30, 24, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  list: {
    gap: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceGreen,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
