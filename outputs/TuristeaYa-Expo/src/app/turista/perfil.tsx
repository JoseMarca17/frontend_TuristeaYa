import { router } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { useCallback, useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { useRemoteData } from '@/hooks/use-remote-data';
import { auth } from '@/services/session';
import { profile } from '@/services/catalog';

export default function MiperfilScreen() {
  const session = useSession();
  const [notice, setNotice] = useState('');
  const load = useCallback(() => session ? profile() : Promise.resolve(null), [session]);
  const { data, loading, error, retry } = useRemoteData(load);
  async function logout() {
    try { await auth.logout(); router.replace('/login'); }
    catch { setNotice('Sesión cerrada en este dispositivo. No se pudo confirmar el cierre en el servidor.'); }
  }
  return (
    <Screen title="Mi perfil" subtitle="Preferencias y recorridos">
      {loading ? <AppText>Cargando cuenta…</AppText> : null}
      {error ? <><AppText accessibilityRole="alert">{error}</AppText><Button title="Reintentar" onPress={retry} /></> : null}
      {notice ? <AppText>{notice}</AppText> : null}
      {data ? <><AppText>{data.full_name}</AppText><AppText>{session?.user.email}</AppText></> : null}
      {!session ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : <Button title="Cerrar sesión" onPress={logout} />}
      <Button title="Mis rutas" onPress={() => router.navigate('/turista/mis-rutas')} />
      <Button title="Cupones" onPress={() => router.navigate('/turista/cupones')} />
      <Button title="Datos de mi cuenta" onPress={() => router.navigate('/turista/cuenta')} />
      <Button title="Experiencias y reservas" onPress={() => router.navigate('/turista/experiencias')} />
      <Button title="Mi cuenta VIP" onPress={() => router.navigate('/vip')} />
      <Button title="Mi negocio" onPress={() => router.navigate('/RamaNegocio')} />
      <Button title="Soporte" onPress={() => router.navigate('/soporte')} />
      <Button title="Administración" onPress={() => router.navigate('/admin')} />
      <Button title="Volver a recorridos" onPress={() => router.navigate('/')} />
    </Screen>
  );
}
