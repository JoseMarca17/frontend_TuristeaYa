import { useState } from 'react';

import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { auth } from '@/services/session';

/** Pantalla 03 del prototipo: crear cuenta. */
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function register() {
    if (busy) return;
    if (!name.trim() || !email.trim() || password.length < 8 || password !== confirm || !accepted) {
      setMessage('Completa tus datos, usa al menos 8 caracteres, confirma la contraseña y acepta los términos.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const notice = await auth.register(name, email, password, accepted);
      if (notice) setMessage(notice); else router.replace('/turista');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear la cuenta.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen title="Crear cuenta" subtitle="Completa tus datos" extraEdges={['bottom']}>
      <FormField label="Nombre" placeholder="María" value={name} onChangeText={setName} />
      <FormField
        label="Correo electrónico"
        placeholder="maria@ejemplo.com"
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
      {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
      <Button title={busy ? 'Creando cuenta…' : 'Registrarme'} disabled={busy} onPress={register} />
      <Button
        title="Ya tengo una cuenta"
        variant="secondary"
        onPress={() => router.navigate('/login')}
      />
    </Screen>
  );
}
