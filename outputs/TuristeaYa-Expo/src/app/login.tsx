import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { DemoAccessModal } from '@/components/auth/demo-access-modal';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

/** Pantalla de inicio de sesión limpia, sin tarjetas técnicas de prueba. */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);

  const loginReal = useAuthStore((s) => s.loginReal);
  const showToast = useUiStore((s) => s.showToast);

  function requestPasswordRecovery() {
    const target = (recoveryEmail || email).trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setRecoveryNotice('Ingresa un correo electrónico válido.');
      return;
    }
    setRecoveryNotice(
      `Si tu cuenta (${target}) solicita confirmación de correo o restablecimiento y no recibes el enlace, puedes explorar toda la aplicación desde Acceso demo al final de esta pantalla.`,
    );
  }

  async function login() {
    if (busy) return;
    if (!email.trim() || !password) {
      setMessage('Completa el correo y la contraseña.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await loginReal(email, password);
      const role = useAuthStore.getState().backendRole;
      showToast('Sesión iniciada.', 'success');
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

  return (
    <Screen title="Iniciar sesión" subtitle="Accede con tu cuenta o explora como invitado" extraEdges={['bottom']}>
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
          </View>
        ) : null}
        <Button title={busy ? 'Ingresando…' : 'Ingresar'} disabled={busy} onPress={login} />
        <View style={styles.secondaryRow}>
          <View style={{ flex: 1 }}>
            <Button title="Crear cuenta" variant="secondary" onPress={() => router.navigate('/register')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Modo invitado" variant="soft" onPress={() => router.navigate('/turista/rutas-disponibles')} />
          </View>
        </View>
        <Button
          title={recoveryOpen ? 'Ocultar ayuda de acceso' : '¿Olvidaste tu contraseña?'}
          variant="soft"
          size="sm"
          onPress={() => {
            setRecoveryEmail((prev) => prev || email);
            setRecoveryOpen((v) => !v);
          }}
        />
        {recoveryOpen ? (
          <View style={styles.alertBox} accessibilityRole="region" accessibilityLabel="Ayuda de recuperación">
            <FormField
              label="Correo de tu cuenta"
              placeholder="usuario@ejemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
            />
            <Button title="Consultar ayuda" size="sm" variant="secondary" onPress={requestPasswordRecovery} />
            {recoveryNotice ? (
              <AppText variant="caption" style={styles.alertText} accessibilityRole="alert">
                {recoveryNotice}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>

      <Button title="Volver al inicio" variant="secondary" onPress={() => router.navigate('/')} />

      {/* Acceso discreto a Vista Demo en la parte inferior */}
      <View style={styles.footerDemoWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir acceso demo"
          hitSlop={10}
          onPress={() => setDemoOpen(true)}
          style={({ pressed }) => [styles.discreetDemoBtn, pressed && { opacity: 0.85 }]}
        >
          <AppText variant="micro" style={styles.discreetDemoText}>
            · demo ·
          </AppText>
        </Pressable>
      </View>

      <DemoAccessModal visible={demoOpen} onClose={() => setDemoOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
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
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderHighlight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertText: {
    color: colors.ink,
  },
  footerDemoWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  discreetDemoBtn: {
    opacity: 0.42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  discreetDemoText: {
    fontSize: 11,
    color: colors.inkMuted,
    letterSpacing: 0.8,
  },
});
