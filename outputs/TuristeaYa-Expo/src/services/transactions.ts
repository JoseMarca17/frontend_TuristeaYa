import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { endpoints } from './endpoints';
import { authenticatedRequest, session } from './session';

const running = new Map<string, Promise<unknown>>();
// Persist pending operation keys before sending, so a timeout/restart can retry safely.
export function transact(kind: 'reserve' | 'redeem', id: string, value: number): Promise<unknown> {
  const userId = session.get()?.user.id;
  if (!userId) return Promise.reject(new Error('Inicia sesión para continuar.'));
  if (!Number.isFinite(value) || value <= 0 || (kind === 'reserve' && !Number.isInteger(value))) {
    return Promise.reject(new Error(kind === 'reserve' ? 'Indica un número entero de participantes.' : 'Indica un importe mayor que cero.'));
  }
  const key = `turisteaya.pending.${userId}.${kind}.${id}.${value}`;
  const previous = running.get(key);
  if (previous) return previous;
  const task = (async () => {
    const requestKey = await AsyncStorage.getItem(key) || randomUUID();
    await AsyncStorage.setItem(key, requestKey);
    if (session.get()?.user.id !== userId) throw new Error('La sesión cambió. Vuelve a intentarlo.');
    const result = await authenticatedRequest(endpoints[kind](id), {
      method: 'POST', body: { request_key: requestKey, [kind === 'reserve' ? 'people' : 'purchase_amount']: value },
    });
    // If cleanup fails, keep the key; the server will return the existing operation.
    await AsyncStorage.removeItem(key).catch(() => {});
    return result;
  })().finally(() => running.delete(key));
  running.set(key, task);
  return task;
}
