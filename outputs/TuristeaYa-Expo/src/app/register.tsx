import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

/** Pantalla 03: crear cuenta real en Supabase/Render (rol inicial tourist). */
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const registerReal = useAuthStore((s) => s.registerReal);
  const showToast = useUiStore((s) => s.showToast);

  async function register() {
    if (busy) return;
    if (!name.trim() || !email.trim() || password.length < 8 || password !== confirm || !accepted) {
      setMessage('Completa tus datos, usa al menos 8 caracteres, confirma la contraseña y acepta los términos.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const notice = await registerReal(name, email, password, accepted);
      if (notice) {
        setMessage(notice);
      } else {
        showToast('Cuenta creada y conectada a Render.', 'success');
        router.replace('/turista');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Crear cuenta" subtitle="Regístrate gratis para guardar rutas, canjear y comentar" extraEdges={['bottom']}>
      <View style={styles.card}>
        <FormField label="Nombre completo" placeholder="María Pérez" value={name} onChangeText={setName} />
        <FormField
          label="Correo electrónico"
          placeholder="maria@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <FormField
          label="Contraseña (mínimo 8 caracteres)"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <FormField
          label="Confirmar contraseña"
          placeholder="••••••••"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
        <AppText variant="label">Aceptación</AppText>
        <Chip
          label="Acepto los términos y privacidad"
          selected={accepted}
          onPress={() => setAccepted((value) => !value)}
        />
        {message ? <AppText accessibilityRole="alert" style={styles.alert}>{message}</AppText> : null}
        <Button title={busy ? 'Creando cuenta…' : 'Registrarme'} disabled={busy} onPress={register} />
      </View>
      <Button
        title="Ya tengo una cuenta"
        variant="secondary"
        onPress={() => router.navigate('/login')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  alert: {
    color: '#991b1b',
  },
});
