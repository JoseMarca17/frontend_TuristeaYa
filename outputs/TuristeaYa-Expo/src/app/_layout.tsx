import { useEffect, useState } from 'react';
import { auth } from '@/services/session';

import { Inter_400Regular, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** Raíz: carga la tipografía Inter y define el stack principal. */
export default function RootLayout() {
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => { void auth.restore().finally(() => setSessionReady(true)); }, []);
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded && sessionReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, sessionReady]);

  if (!loaded || !sessionReady) {
    return null;
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
    </>
  );
}
