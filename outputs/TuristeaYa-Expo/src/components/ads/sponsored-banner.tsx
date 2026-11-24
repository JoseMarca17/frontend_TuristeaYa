import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { listRecords } from '@/services/catalog';
import { shouldShowAdToUser } from '@/services/domain-rules';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

type CampaignRow = {
  id: string;
  business_id?: string | null;
  title?: string | null;
  ad_text?: string | null;
  placement?: string | null;
  budget?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  zone_id?: string | null;
  category_id?: string | null;
  radius_meters?: number | null;
  status?: string | null;
};

export function SponsoredCampaignBanner({
  placement = 'home',
  origin,
}: {
  placement?: 'home' | 'catalog' | 'routes' | 'detail';
  origin?: { latitude: number; longitude: number } | null;
}) {
  const vipActive = useAuthStore((s) => s.hasActiveVip);
  const role = useAuthStore((s) => s.demoRole || s.backendRole);
  const showToast = useUiStore((s) => s.showToast);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    if (vipActive || role === 'vip') return;
    const ctrl = new AbortController();
    listRecords<CampaignRow>('campaigns', { signal: ctrl.signal })
      .then((rows) => setCampaigns(rows))
      .catch(() => {});
    return () => ctrl.abort();
  }, [vipActive, role]);

  // Regla VIP (Fases 1, 6 y 8): ocultar anuncios cuando exista una suscripción VIP activa.
  if (vipActive || role === 'vip') {
    return null;
  }

  const visible = campaigns.filter(
    (item) =>
      !dismissedIds.includes(item.id)
      && (!item.placement || item.placement === placement || placement === 'home')
      && shouldShowAdToUser(item, false, origin, null),
  );

  const selected = visible[0];
  if (!selected) return null;

  return (
    <View
      style={styles.card}
      accessibilityRole="region"
      accessibilityLabel={`Anuncio patrocinado: ${selected.title || 'Promoción destacada'}`}
    >
      <View style={styles.topRow}>
        <AppText variant="micro" color="primary">
          Patrocinado · Publicidad local
        </AppText>
        <Pressable
          onPress={() => setDismissedIds((prev) => [...prev, selected.id])}
          accessibilityRole="button"
          accessibilityLabel="Cerrar anuncio patrocinado"
          style={styles.closeBtn}
        >
          <AppText variant="caption" color="inkSoft">
            Ocultar
          </AppText>
        </Pressable>
      </View>
      <AppText variant="section">{selected.title || 'Experiencia patrocinada'}</AppText>
      {selected.ad_text ? (
        <AppText variant="bodySmall" color="inkSoft">
          {selected.ad_text}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            showToast('Abriendo promociones y experiencias del anuncio.', 'info');
            router.push('/turista/cupones' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Explorar promoción patrocinada"
          style={styles.ctaPrimary}
        >
          <AppText variant="caption" color="onPrimary">
            Ver promoción
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => router.push('/vip' as never)}
          accessibilityRole="button"
          accessibilityLabel="Quitar anuncios haciéndote VIP"
          style={styles.ctaSecondary}
        >
          <AppText variant="caption" color="primary">
            Sin anuncios con VIP
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderSoftGreen,
    backgroundColor: colors.surfaceGreen,
    gap: 6,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: { minWidth: 44, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  ctaPrimary: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  ctaSecondary: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.primary,
  },
});
