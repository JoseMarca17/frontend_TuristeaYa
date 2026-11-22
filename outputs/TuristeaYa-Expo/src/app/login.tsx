import { useState } from 'react';

import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { AppText } from '@/components/ui/app-text';
import { auth } from '@/services/session';

/** Pantalla 02 del prototipo: iniciar sesión. */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function login() {
    if (busy) return;
    if (!email.trim() || !password) { setMessage('Completa el correo y la contraseña.'); return; }
    setBusy(true); setMessage('');
    try { await auth.login(email, password); router.replace('/turista'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  }

  const goToTuristaHome = () => router.navigate('/turista');

  return (
    <Screen title="Iniciar sesión" subtitle="Bienvenido a TuristeaYA" extraEdges={['bottom']}>
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
      {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
      <Button title={busy ? 'Ingresando…' : 'Ingresar'} disabled={busy} onPress={login} />
      <Button
        title="Crear una cuenta"
        variant="secondary"
        onPress={() => router.navigate('/register')}
      />
      <Button title="Continuar como invitado" variant="secondary" onPress={goToTuristaHome} />
      <Button title="Volver a los recorridos" variant="secondary" onPress={() => router.navigate('/')} />
    </Screen>
  );
}
