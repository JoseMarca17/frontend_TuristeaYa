import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();

/**
 * Adaptador de almacenamiento seguro para Expo Go, navegador y exportación estática (SSR).
 * Evita errores cuando `window` no está disponible durante `expo export`.
 */
export const safeStorage: StateStorage = {
  getItem: async (name) => {
    if (typeof window === 'undefined' && typeof navigator === 'undefined') {
      return memory.get(name) ?? null;
    }
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem: async (name, value) => {
    memory.set(name, value);
    if (typeof window === 'undefined' && typeof navigator === 'undefined') return;
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // Ignora fallos de cuota en almacenamiento local sin interrumpir la sesión.
    }
  },
  removeItem: async (name) => {
    memory.delete(name);
    if (typeof window === 'undefined' && typeof navigator === 'undefined') return;
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // Ignora fallos al limpiar almacenamiento.
    }
  },
};
