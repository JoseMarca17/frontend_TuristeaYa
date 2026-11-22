const key = 'turisteaya.refresh.v1';
export async function readRefreshToken(): Promise<string | null> {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
}
export async function writeRefreshToken(value: string | null): Promise<void> {
  if (typeof window === 'undefined') return;
  if (value) window.sessionStorage.setItem(key, value);
  else window.sessionStorage.removeItem(key);
}
