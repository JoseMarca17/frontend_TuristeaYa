import { Ionicons } from '@expo/vector-icons';
import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { colors, radius, spacing, borderWidth } from '@/theme';

export type TabItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

/**
 * Barras de pestañas por área con rutas reales verificadas.
 */
export const tabsByArea: Record<string, readonly TabItem[]> = {
  turista: [
    { label: 'Inicio', href: '/turista', icon: 'home-outline', activeIcon: 'home' },
    { label: 'Rutas', href: '/turista/rutas-disponibles', icon: 'map-outline', activeIcon: 'map' },
    { label: 'Cupones', href: '/turista/cupones', icon: 'pricetag-outline', activeIcon: 'pricetag' },
    { label: 'Mis rutas', href: '/turista/mis-rutas', icon: 'bookmark-outline', activeIcon: 'bookmark' },
    { label: 'Perfil', href: '/turista/perfil', icon: 'person-outline', activeIcon: 'person' },
  ],
  RamaNegocio: [
    { label: 'Resumen', href: '/RamaNegocio', icon: 'storefront-outline', activeIcon: 'storefront' },
    { label: 'Cupones', href: '/RamaNegocio/promociones', icon: 'pricetag-outline', activeIcon: 'pricetag' },
    { label: 'Campañas', href: '/RamaNegocio/proximamente', icon: 'megaphone-outline', activeIcon: 'megaphone' },
    { label: 'Mi local', href: '/RamaNegocio/datos', icon: 'business-outline', activeIcon: 'business' },
    { label: 'Ayuda', href: '/RamaNegocio/ayuda', icon: 'help-circle-outline', activeIcon: 'help-circle' },
  ],
  vip: [
    { label: 'VIP', href: '/vip', icon: 'diamond-outline', activeIcon: 'diamond' },
    { label: 'Rutas', href: '/turista/rutas-disponibles', icon: 'map-outline', activeIcon: 'map' },
    { label: 'Experiencias', href: '/turista/experiencias', icon: 'sparkles-outline', activeIcon: 'sparkles' },
    { label: 'Perfil', href: '/turista/perfil', icon: 'person-outline', activeIcon: 'person' },
  ],
  soporte: [
    { label: 'Tickets', href: '/soporte', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { label: 'Rutas', href: '/turista/rutas-disponibles', icon: 'map-outline', activeIcon: 'map' },
    { label: 'Roles', href: '/', icon: 'people-outline', activeIcon: 'people' },
  ],
  admin: [
    { label: 'Admin', href: '/admin', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark' },
    { label: 'Soporte', href: '/soporte', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { label: 'Rutas', href: '/turista/rutas-disponibles', icon: 'map-outline', activeIcon: 'map' },
    { label: 'Roles', href: '/', icon: 'people-outline', activeIcon: 'people' },
  ],
};

/** Barra de pestañas inferior con iconos y píldora activa. */
export function AppTabBar() {
  const pathname = usePathname();
  const area = pathname.split('/')[1] ?? '';
  const tabs = tabsByArea[area];
  if (!tabs) return null;

  const isActive = (href: string) =>
    href === `/${area}`
      ? pathname === href || !tabs.some((tab) => tab.href !== href && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)))
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <SafeAreaView edges={['bottom']} style={styles.bar}>
      <View style={styles.row}>
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(tab.href as Href)}
              style={styles.tab}
            >
              <View style={[styles.pill, active && styles.pillActive]}>
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={18}
                  color={active ? colors.primary : colors.inkSoft}
                />
                <AppText
                  variant="micro"
                  style={[styles.label, active && styles.labelActive]}
                  numberOfLines={1}
                >
                  {tab.label}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, paddingHorizontal: 2 },
  pill: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  pillActive: { backgroundColor: colors.surfaceGreen },
  label: { color: colors.inkSoft, fontSize: 11 },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
