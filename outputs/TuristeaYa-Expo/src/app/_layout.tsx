import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth, session } from '@/services/session';
import { useAuthStore } from '@/stores/use-auth-store';
import { AppText } from '@/components/ui/app-text';
import { GlobalLoader } from '@/components/ui/global-loader';
import { GlobalToast } from '@/components/ui/global-toast';

import { Inter_400Regular, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** Raíz: carga la tipografía Inter, restaura la sesión y monta el loader/toast globales. */
export default function RootLayout() {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      void useAuthStore.getState().syncFromSession(session.get());
    };
    const unsubscribe = session.subscribe(sync);
    void auth
      .restore()
      .then(() => {
        sync();
      })
      .finally(() => setSessionReady(true));
    return unsubscribe;
  }, []);

  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  if (!sessionReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: colors.background, padding: 24 }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="section">Restaurando sesión…</AppText>
        <AppText variant="caption" color="inkSoft">Conectando con TuristeaYa en Render</AppText>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <GlobalToast />
      <GlobalLoader />
    </>
  );
}
