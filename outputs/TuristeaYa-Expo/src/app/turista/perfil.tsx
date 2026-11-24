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
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, profile } from '@/services/catalog';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { selectEffectiveRole, useAuthStore } from '@/stores/use-auth-store';
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

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const categories = await listRecords('categories', { signal });
    if (!session) return { me: null, interests: [], categories };
    const [me, interests] = await Promise.all([
      profile(),
      listRecords('user-interests', { signal, private: true, filters: { user_id: session.user.id } }),
    ]);
    return { me, interests: interests.filter((row) => row.user_id === session.user.id), categories };
  }, [session]);

  const { data, loading, error, retry } = useRemoteData(load);
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
