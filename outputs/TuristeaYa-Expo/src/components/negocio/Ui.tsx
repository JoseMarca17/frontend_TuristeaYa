import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { C } from '../../constants/negocioTheme';

export type Tab = { label: string; ruta?: string };

export const TABS_NEGOCIO: Tab[] = [
  { label: 'Resumen', ruta: '/RamaNegocio' },
  { label: 'Cupones', ruta: '/RamaNegocio/promociones' },
  { label: 'Campañas', ruta: '/RamaNegocio/proximamente' },
  { label: 'Mi local', ruta: '/RamaNegocio/datos' },
];

export const TABS_USUARIO: Tab[] = [
  { label: 'Inicio', ruta: '/turista' },
  { label: 'Mis rutas', ruta: '/turista/mis-rutas' },
  { label: 'Cupones', ruta: '/turista/cupones' },
  { label: 'Perfil', ruta: '/turista/perfil' },
];

export function useIr() {
  const router = useRouter();
  return {
    ir: (ruta: string, params?: Record<string, string>) =>
      router.push((params ? { pathname: ruta, params } : ruta) as any),
    volver: () =>
      router.canGoBack() ? router.back() : router.replace('/' as any),
  };
}

type PantallaProps = {
  titulo: string;
  subtitulo?: string;
  tabs?: Tab[];
  activa?: string;
  children: React.ReactNode;
};

/** Delega al componente `Screen` unificado; la barra inferior la aporta `_layout.tsx`. */
export function Pantalla({ titulo, subtitulo, children }: PantallaProps) {
  return (
    <Screen title={titulo} subtitle={subtitulo}>
      {children}
    </Screen>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Boton({
  texto,
  onPress,
  variante = 'lleno',
}: {
  texto: string;
  onPress?: () => void;
  variante?: 'lleno' | 'borde';
}) {
  const lleno = variante === 'lleno';
  return (
    <Pressable onPress={onPress} style={[s.boton, lleno ? s.botonLleno : s.botonBorde]}>
      <Text style={[s.botonTexto, { color: lleno ? '#fff' : C.verde }]}>{texto}</Text>
    </Pressable>
  );
}

export function Campo({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={C.gris}
        {...props}
        style={[s.input, props.multiline && { minHeight: 70, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, activo && s.chipActivo]}>
      <Text style={s.chipTexto}>{texto}</Text>
    </Pressable>
  );
}

export function Foto({ texto, onPress }: { texto: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.foto}>
      <Text style={s.fotoTexto}>{texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 12,
    padding: 14,
    backgroundColor: C.fondo,
    gap: 4,
  },
  boton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  botonLleno: { backgroundColor: C.verde },
  botonBorde: { borderWidth: 1.5, borderColor: C.verde },
  botonTexto: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: C.texto, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.texto,
    backgroundColor: C.fondo,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActivo: { backgroundColor: C.verdeClaro, borderColor: C.verde },
  chipTexto: { fontSize: 13, color: C.texto },
  foto: {
    backgroundColor: C.durazno,
    borderWidth: 1,
    borderColor: C.duraznoBorde,
    borderRadius: 12,
    height: 100,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fotoTexto: { fontSize: 13, color: C.gris },
});
