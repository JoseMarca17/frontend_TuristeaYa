import * as SecureStore from 'expo-secure-store';
const key = 'turisteaya.refresh.v1';
export const readRefreshToken = () => SecureStore.getItemAsync(key);
export const writeRefreshToken = (value: string | null) => value
  ? SecureStore.setItemAsync(key, value)
  : SecureStore.deleteItemAsync(key);
