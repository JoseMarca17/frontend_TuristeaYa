import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
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
import { useOfflineStore } from '@/stores/use-offline-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export default function MiperfilScreen() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoAccount = useAuthStore((s) => s.demoAccount);
  const effectiveRole = useAuthStore(selectEffectiveRole);
  const refreshMeta = useAuthStore((s) => s.refreshMeta);
  const logoutStore = useAuthStore((s) => s.logout);
  const showToast = useUiStore((s) => s.showToast);
  const localRedemptions = useCouponStore((s) => s.redemptions);
  const offlineCount = useOfflineStore((s) => s.items.length);

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const categories = await listRecords('categories', { signal });
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
  const fullName = fullNameDraft ?? data?.me?.full_name ?? '';
  const phone = phoneDraft ?? data?.me?.phone ?? '';

  async function saveProfile() {
    if (!session || busy || !fullName.trim()) return;
    setBusy(true);
    try {
      await updateRecord(
        'profiles',
        session.user.id,
        { full_name: fullName.trim(), phone: phone.trim() || null },
        'Actualizando perfil en Render…',
      );
      setFullNameDraft(null);
      setPhoneDraft(null);
      await refreshMeta();
      showToast('Perfil actualizado en Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleInterest(categoryId: string) {
    if (!session || busy) return;
    const existing = data?.interests.find((item) => item.category_id === categoryId);
    setBusy(true);
    try {
      if (existing) {
        await deleteRecord('user-interests', existing.id, 'Quitando interés…');
        showToast('Interés eliminado.', 'info');
      } else {
        await createRecord('user-interests', { user_id: session.user.id, category_id: categoryId }, 'Guardando interés…');
        showToast('Interés guardado en Render.', 'success');
      }
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
      showToast('Sesión cerrada.', 'info');
      router.replace('/login');
    } catch {
      showToast('Sesión cerrada localmente.', 'info');
      router.replace('/login');
    }
  }

  return (
    <Screen title="Mi perfil" subtitle="Cuenta, intereses y accesos por rol">
      <RoleBanner />

      {loading ? <LoadingState label="Cargando perfil e intereses…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {session && data?.me ? (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText variant="section">Datos personales (Render)</AppText>
            <Badge label={effectiveRole.toUpperCase()} tone="green" />
          </View>
          <AppText variant="caption" color="inkSoft">{session.user.email}</AppText>
          <FormField label="Nombre completo" value={fullName} onChangeText={setFullNameDraft} editable={!busy} />
          <FormField label="Teléfono" value={phone} onChangeText={setPhoneDraft} placeholder="Ej. 70012345" keyboardType="phone-pad" editable={!busy} />
          <Button title={busy ? 'Guardando…' : 'Guardar perfil (PATCH)'} disabled={busy || !fullName.trim()} onPress={() => { void saveProfile(); }} />
        </View>
      ) : demoRole && demoAccount ? (
        <View style={styles.card}>
          <AppText variant="section">{demoAccount.fullName}</AppText>
          <AppText variant="caption" color="inkSoft">{demoAccount.email} · Vista Demo ({demoAccount.roleLabel})</AppText>
        </View>
      ) : null}

      {session && data?.categories ? (
        <View style={styles.card}>
          <AppText variant="section">Mis intereses turísticos</AppText>
          <AppText variant="caption" color="inkSoft">
            Toca una categoría para agregar o quitar en Render (`POST` / `DELETE /user-interests`).
          </AppText>
          <View style={styles.chipWrap}>
            {data.categories.slice(0, 12).map((cat) => {
              const selected = data.interests.some((row) => row.category_id === cat.id);
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
        <View style={styles.rowBetween}>
          <AppText variant="section">Historial y beneficios</AppText>
          <Badge
            label={vipSummary.active ? `VIP (${vipSummary.daysRemaining}d)` : vipSummary.isExpired ? 'VIP expirado' : 'Plan estándar'}
            tone={vipSummary.active ? 'green' : 'cream'}
          />
        </View>
        <AppText variant="caption" color="inkSoft">
          {vipSummary.active
            ? 'Suscripción VIP vigente: anuncios ocultos, descargas offline y reservas exclusivas habilitadas.'
            : vipSummary.isExpired
              ? 'Tu suscripción VIP expiró; las funciones exclusivas quedan bloqueadas automáticamente hasta renovar.'
              : 'Activa VIP para ocultar anuncios, usar descargas SQLite offline y acceder a experiencias exclusivas.'}
        </AppText>
        <View style={styles.chipWrap}>
          <Badge label={`${data?.subscriptions.length ?? 0} suscripciones`} tone="cream" />
          <Badge label={`${data?.reservations.length ?? 0} reservas`} tone="cream" />
          <Badge label={`${(data?.redemptions.length ?? 0) || localRedemptions.length} canjes`} tone="cream" />
          <Badge label={`${offlineCount} rutas offline`} tone="green" />
        </View>
        {data?.subscriptions.slice(0, 2).map((sub) => (
          <ListCard
            key={sub.id}
            title={`Suscripción ${String(sub.status || 'activa')}`}
            body={sub.ends_at ? `Vigencia hasta ${new Date(String(sub.ends_at)).toLocaleDateString()}` : 'Sin fecha de expiración'}
          />
        ))}
        <Button title="Ver historial completo en Mi cuenta" size="sm" variant="secondary" onPress={() => router.navigate('/turista/cuenta')} />
      </View>

      <View style={styles.card}>
        <AppText variant="section">Módulos de la plataforma</AppText>
        <View style={styles.menuGrid}>
          <NavRow icon="map-outline" label="Todas las rutas" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          <NavRow icon="bookmark-outline" label="Mis rutas guardadas" onPress={() => router.navigate('/turista/mis-rutas')} />
          <NavRow icon="pricetag-outline" label="Cupones y descuentos" onPress={() => router.navigate('/turista/cupones')} />
          <NavRow icon="person-circle-outline" label="Reservas, tickets y avisos" onPress={() => router.navigate('/turista/cuenta')} />
          <NavRow icon="sparkles-outline" label="Experiencias" onPress={() => router.navigate('/turista/experiencias')} />
          <NavRow icon="diamond-outline" label="Panel VIP" onPress={() => router.navigate('/vip')} />
          <NavRow icon="storefront-outline" label="Panel de Negocio" onPress={() => router.navigate('/RamaNegocio')} />
          <NavRow icon="chatbubbles-outline" label="Panel de Soporte" onPress={() => router.navigate('/soporte')} />
          <NavRow icon="shield-checkmark-outline" label="Panel de Administración" onPress={() => router.navigate('/admin')} />
          <NavRow icon="people-outline" label="Guía de roles y demos" onPress={() => router.navigate('/')} />
        </View>
      </View>

      {!session && !demoRole ? (
        <Button title="Iniciar sesión / Usar cuenta demo" onPress={() => router.navigate('/login')} />
      ) : (
        <Button title="Cerrar sesión" variant="secondary" onPress={() => { void logout(); }} />
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
