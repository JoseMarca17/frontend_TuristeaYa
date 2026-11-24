import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { router, type Href } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { DEMO_ACCOUNTS, type DemoAccount } from '@/services/demo-accounts';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

/** Pantalla 02: inicio de sesión real en Render + selector de usuarios demo por rol. */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fallbackAccount, setFallbackAccount] = useState<DemoAccount | null>(null);

  const loginReal = useAuthStore((s) => s.loginReal);
  const loginDemoOnRender = useAuthStore((s) => s.loginDemoOnRender);
  const enterDemoPreview = useAuthStore((s) => s.enterDemoPreview);
  const showToast = useUiStore((s) => s.showToast);

  async function login() {
    if (busy) return;
    if (!email.trim() || !password) {
      setMessage('Completa el correo y la contraseña.');
      return;
    }
    setBusy(true);
    setMessage('');
    setFallbackAccount(null);
    try {
      await loginReal(email, password);
      const role = useAuthStore.getState().backendRole;
      showToast('Sesión iniciada en Render.', 'success');
      if (role === 'admin') router.replace('/admin');
      else if (role === 'support') router.replace('/soporte');
      else if (role === 'advertiser') router.replace('/RamaNegocio');
      else router.replace('/turista');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoLogin(account: DemoAccount) {
    if (busy) return;
    setEmail(account.email);
    setPassword(account.password);
    setBusy(true);
    setMessage('');
    setFallbackAccount(null);
    try {
      const result = await loginDemoOnRender(account.key);
      if (result.ok) {
        showToast(result.message, 'success');
        router.replace(account.routeTarget as Href);
      } else {
        setMessage(result.message);
        if (result.canFallbackToDemoPreview) setFallbackAccount(account);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDemoPreview(account: DemoAccount) {
    enterDemoPreview(account.key);
    showToast(`Vista Demo activada para ${account.title}.`, 'info');
    router.replace(account.routeTarget as Href);
  }

  return (
    <Screen title="Iniciar sesión" subtitle="Conecta con tu cuenta en Render o prueba un rol demo" extraEdges={['bottom']}>
      <View style={styles.formCard}>
        <FormField
          label="Correo electrónico"
          placeholder="usuario@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <FormField
          label="Contraseña"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {message ? (
          <View style={styles.alertBox}>
            <AppText variant="bodySmall" accessibilityRole="alert" style={styles.alertText}>
              {message}
            </AppText>
            {fallbackAccount ? (
              <Button
                title={`Entrar en Vista Demo (${fallbackAccount.title})`}
                size="sm"
                variant="secondary"
                onPress={() => handleDemoPreview(fallbackAccount)}
              />
            ) : null}
          </View>
        ) : null}
        <Button title={busy ? 'Ingresando…' : 'Ingresar'} disabled={busy} onPress={login} />
        <View style={styles.secondaryRow}>
          <View style={{ flex: 1 }}>
            <Button title="Crear una cuenta" variant="secondary" onPress={() => router.navigate('/register')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Modo invitado" variant="soft" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          </View>
        </View>
      </View>

      <View style={styles.demoHeader}>
        <AppText variant="section">Usuarios demo por rol (ejemplos listos)</AppText>
        <AppText variant="caption" color="inkSoft">
          Turista y Negocio crean/conectan una sesión real automática en Render. VIP, Soporte y Admin conectan si tienen el rol asignado en Render o abren su Vista Demo.
        </AppText>
      </View>

      {DEMO_ACCOUNTS.map((account) => (
        <View key={account.key} style={styles.demoCard}>
          <View style={styles.demoTop}>
            <View style={{ flex: 1 }}>
              <AppText variant="section">{account.title}</AppText>
              <AppText variant="micro" color="inkSoft">{account.roleLabel}</AppText>
            </View>
            <Badge label={account.badge} tone={account.key === 'vip' ? 'cream' : 'green'} />
          </View>
          <AppText variant="caption">{account.summary}</AppText>
          <View style={styles.credStrip}>
            <Ionicons name="key-outline" size={14} color={colors.primary} />
            <AppText variant="micro" selectable style={{ flex: 1 }}>
              {account.email} · {account.password}
            </AppText>
          </View>
          <View style={styles.demoButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEmail(account.email);
                setPassword(account.password);
                setMessage(`Credenciales de ${account.title} cargadas en el formulario.`);
                setFallbackAccount(null);
              }}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.miniPressed]}
            >
              <AppText variant="caption" style={styles.miniText}>Rellenar</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => { void handleDemoLogin(account); }}
              style={({ pressed }) => [styles.miniBtnPrimary, pressed && styles.miniPrimaryPressed]}
            >
              <AppText variant="caption" style={styles.miniPrimaryText}>
                {account.canAutoRegisterOnRender ? 'Entrar en Render' : 'Probar en Render'}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => handleDemoPreview(account)}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.miniPressed]}
            >
              <AppText variant="caption" style={styles.miniText}>Vista Demo</AppText>
            </Pressable>
          </View>
        </View>
      ))}

      <Button title="Volver a guía de roles" variant="secondary" onPress={() => router.navigate('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  alertBox: {
    backgroundColor: colors.highlight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertText: {
    color: colors.ink,
  },
  demoHeader: {
    gap: 2,
    marginTop: spacing.xs,
  },
  demoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  demoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  credStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  demoButtons: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    flexWrap: 'wrap',
  },
  miniBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    backgroundColor: colors.surface,
  },
  miniPressed: {
    backgroundColor: colors.surfaceGreen,
  },
  miniText: {
    color: colors.primary,
    fontWeight: '700',
  },
  miniBtnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  miniPrimaryPressed: {
    backgroundColor: colors.primaryDeep,
  },
  miniPrimaryText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
});
