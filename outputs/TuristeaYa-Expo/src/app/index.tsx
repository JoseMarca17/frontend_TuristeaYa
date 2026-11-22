import { router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';

/** Entrada a los módulos; los permisos se comprueban con la cuenta autenticada. */
export default function RoleSelectorScreen() {
  return (
    <Screen title="TuristeaYA" subtitle="Descubre y planifica tu próxima salida" showBack={false} extraEdges={['bottom']}>
      <AppText variant="body">
        {'Planifica una salida según tu tiempo, ubicación\ny presupuesto.'}
      </AppText>
      <Button title="Entrar como turista" onPress={() => router.navigate('/login')} />
      <Button title="Explorar como invitado" variant="secondary" onPress={() => router.navigate('/turista/catalogo')} />
      <Button title="Ver usuario VIP" variant="secondary" onPress={() => router.navigate('/vip')} />
      <Button
        title="Ver panel del negocio"
        variant="secondary"
        onPress={() => router.navigate('/RamaNegocio')}
      />
      <Button title="Ver soporte" variant="secondary" onPress={() => router.navigate('/soporte')} />
      <Button
        title="Ver administrador"
        variant="secondary"
        onPress={() => router.navigate('/admin')}
      />
      <AppText variant="body" style={{ marginTop: 24 }}>
        {
          'Los paneles de negocio, soporte y administración requieren una cuenta con los permisos correspondientes.'
        }
      </AppText>
    </Screen>
  );
}
