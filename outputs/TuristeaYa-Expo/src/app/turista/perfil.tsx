import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, profile } from '@/services/catalog';
import { getVipStatusSummary } from '@/services/domain-rules';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { selectEffectiveRole, useAuthStore } from '@/stores/use-auth-store';
import { useCouponStore } from '@/stores/use-coupon-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useOfflineStore } from '@/stores/use-offline-store';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

export default function MiperfilScreen() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const effectiveRole = useAuthStore(selectEffectiveRole);
  const refreshMeta = useAuthStore((s) => s.refreshMeta);
  const logoutStore = useAuthStore((s) => s.logout);
  const showToast = useUiStore((s) => s.showToast);

  const localRedemptions = useCouponStore((s) => s.redemptions);
  const offlineCount = useOfflineStore((s) => s.items.length);

  const demoName = useDemoStore((s) => s.profileName);
  const demoPhone = useDemoStore((s) => s.profilePhone);
  const demoInterests = useDemoStore((s) => s.interests);
  const demoReservations = useDemoStore((s) => s.reservations);
  const updateDemoProfile = useDemoStore((s) => s.updateProfile);
  const toggleDemoInterest = useDemoStore((s) => s.toggleInterest);

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const categories = await listRecords('categories', { signal }).catch(() => []);
    if (!session) return { me: null, interests: [], subscriptions: [], reservations: [], redemptions: [], categories };
    const [me, interests, subscriptions, reservations, redemptions] = await Promise.all([
      profile(),
      listRecords('user-interests', { signal, private: true, filters: { user_id: session.user.id } }),
      listRecords('subscriptions', { signal, private: true, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('reservations', { signal, private: true, filters: { user_id: session.user.id } }).catch(() => []),
      listRecords('coupon-redemptions', { signal, private: true, filters: { user_id: session.user.id } }).catch(() => []),
    ]);
    return {
      me,
      interests: interests.filter((row) => row.user_id === session.user.id),
      subscriptions: subscriptions.filter((row) => row.user_id === session.user.id),
      reservations: reservations.filter((row) => row.user_id === session.user.id),
      redemptions: redemptions.filter((row) => row.user_id === session.user.id),
      categories,
    };
  }, [session]);

  const { data, loading, error, retry } = useRemoteData(load);
  const vipSummary = getVipStatusSummary(
    (data?.subscriptions || []) as { id: string; user_id: string; status?: string; starts_at?: string; ends_at?: string }[],
    session?.user.id,
    nowMs,
    !session && demoRole === 'vip',
  );
  const fullName = fullNameDraft ?? (isDemo ? demoName : data?.me?.full_name ?? '');
  const phone = phoneDraft ?? (isDemo ? demoPhone : data?.me?.phone ?? '');

  async function saveProfile() {
    if (!fullName.trim() || busy) return;
    if (isDemo) {
      updateDemoProfile(fullName.trim(), phone.trim());
      setFullNameDraft(null);
      setPhoneDraft(null);
      showToast('Perfil actualizado.', 'success');
      return;
    }
    if (!session) return;
    setBusy(true);
    try {
      await updateRecord(
        'profiles',
        session.user.id,
        { full_name: fullName.trim(), phone: phone.trim() || null },
        'Guardando perfil…',
      );
      setFullNameDraft(null);
      setPhoneDraft(null);
      await refreshMeta();
      showToast('Perfil actualizado.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleInterest(categoryId: string) {
    if (busy) return;
    if (isDemo) {
      toggleDemoInterest(categoryId);
      showToast('Preferencias actualizadas.', 'success');
      return;
    }
    if (!session) return;
    const existing = data?.interests.find((item) => item.category_id === categoryId);
    setBusy(true);
    try {
      if (existing) {
        await deleteRecord('user-interests', existing.id, 'Quitando preferencia…');
      } else {
        await createRecord('user-interests', { user_id: session.user.id, category_id: categoryId }, 'Guardando preferencia…');
      }
      showToast('Preferencias actualizadas.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar intereses.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await logoutStore();
    } finally {
      showToast('Sesión cerrada.', 'info');
      router.replace('/');
    }
  }

  const totalRedemptions = isDemo ? localRedemptions.length : (data?.redemptions.length ?? 0) || localRedemptions.length;
  const totalReservations = isDemo ? demoReservations.length : (data?.reservations.length ?? 0);

  return (
    <Screen title="Mi perfil" subtitle="Datos personales, preferencias y actividad">
      <RoleBanner />

      {loading ? <LoadingState label="Cargando perfil…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {session || isDemo ? (
        <View style={styles.card}>
          <AppText variant="section">Datos personales</AppText>
          <AppText variant="caption" color="inkSoft">
            {session ? session.user.email : `Perfil activo (${effectiveRole})`}
          </AppText>
          <FormField label="Nombre completo" value={fullName} onChangeText={setFullNameDraft} editable={!busy} />
          <FormField label="Teléfono" value={phone} onChangeText={setPhoneDraft} placeholder="Ej. 70012345" keyboardType="phone-pad" editable={!busy} />
          <Button title={busy ? 'Guardando…' : 'Guardar cambios'} disabled={busy || !fullName.trim()} onPress={() => { void saveProfile(); }} />
        </View>
      ) : null}

      {(session || isDemo) && data?.categories && data.categories.length > 0 ? (
        <View style={styles.card}>
          <AppText variant="section">Mis intereses</AppText>
          <View style={styles.chipWrap}>
            {data.categories.slice(0, 12).map((cat) => {
              const selected = isDemo
                ? demoInterests.includes(cat.id)
                : data.interests.some((row) => row.category_id === cat.id);
              return (
                <Chip
                  key={cat.id}
                  label={String(cat.name)}
                  selected={selected}
                  onPress={() => { void toggleInterest(cat.id); }}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <AppText variant="section">Resumen y beneficios</AppText>
        <AppText variant="bodySmall" color="inkSoft">
          {vipSummary.active
            ? `Plan VIP activo (${vipSummary.daysRemaining} días restantes): navegación sin anuncios y mapas sin conexión.`
            : vipSummary.isExpired
              ? 'Tu membresía VIP expiró.'
              : 'Plan estándar activo.'}
        </AppText>
        <AppText variant="caption" color="inkSoft">
          {totalReservations} reservas · {totalRedemptions} canjes · {offlineCount} rutas sin conexión
        </AppText>
        {data?.subscriptions.slice(0, 2).map((sub) => (
          <ListCard
            key={sub.id}
            title={`Suscripción ${String(sub.status || 'activa')}`}
            body={sub.ends_at ? `Vigente hasta ${new Date(String(sub.ends_at)).toLocaleDateString()}` : ''}
          />
        ))}
        <Button title="Ver historial en Mi cuenta" size="sm" variant="secondary" onPress={() => router.navigate('/turista/cuenta')} />
      </View>

      <View style={styles.card}>
        <AppText variant="section">Accesos rápidos</AppText>
        <View style={styles.menuGrid}>
          <NavRow icon="map-outline" label="Todas las rutas" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          <NavRow icon="bookmark-outline" label="Mis rutas guardadas" onPress={() => router.navigate('/turista/mis-rutas')} />
          <NavRow icon="pricetag-outline" label="Cupones y descuentos" onPress={() => router.navigate('/turista/cupones')} />
          <NavRow icon="person-circle-outline" label="Reservas, avisos y reportes" onPress={() => router.navigate('/turista/cuenta')} />
          <NavRow icon="sparkles-outline" label="Experiencias" onPress={() => router.navigate('/turista/experiencias')} />
          <NavRow icon="diamond-outline" label="Mi cuenta VIP" onPress={() => router.navigate('/vip')} />
          <NavRow icon="home-outline" label="Pantalla principal" onPress={() => router.navigate('/')} />
        </View>
      </View>

      {!session && !demoRole ? (
        <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} />
      ) : (
        <Button title={isDemo ? 'Salir de vista demo' : 'Cerrar sesión'} variant="secondary" onPress={() => { void logout(); }} />
      )}
    </Screen>
  );
}

function NavRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Button title={label} variant="secondary" align="left" size="sm" onPress={onPress} accessibilityLabel={`${icon}: ${label}`} />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  menuGrid: {
    gap: spacing.xs + 2,
  },
});
