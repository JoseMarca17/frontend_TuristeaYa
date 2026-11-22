import { endpoints } from './endpoints';
import { ApiError, request } from './http';
import { readRefreshToken, writeRefreshToken } from './token-storage';

export type Session = { access_token: string; refresh_token: string; user: { id: string; email?: string } };
// Only the refresh token persists: native SecureStore, browser sessionStorage.
let current: Session | null = null;
let persistence: Promise<void> = Promise.resolve();
let storageWarning = '';
function persist(value: Session | null) {
  persistence = persistence.catch(() => {}).then(() => writeRefreshToken(value?.refresh_token || null)).then(() => {
    storageWarning = '';
  }).catch(() => {
    storageWarning = 'No se pudo actualizar el almacenamiento de sesión del dispositivo.';
  });
}
let generation = 0;
let refreshTask: Promise<Session | null> | undefined;
const listeners = new Set<() => void>();
export const session = {
  get: () => current,
  storageWarning: () => storageWarning,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(value: Session | null) { generation++; refreshTask = undefined; current = value; persist(value); listeners.forEach((listener) => listener()); },
};
function validSession(value: Session) {
  if (!value?.access_token || !value.refresh_token || !value.user?.id) throw new ApiError('El servidor no devolvió una sesión válida.');
  return value;
}
export const auth = {
  async restore() {
    const version = generation;
    try {
      const token = await readRefreshToken();
      if (!token || version !== generation) return;
      const next = validSession(await request<Session>(endpoints.refresh, { method: 'POST', body: { refresh_token: token } }));
      if (version === generation) session.set(next);
    } catch (error) {
      if (version === generation && error instanceof ApiError && [400, 401, 403].includes(error.status ?? 0)) session.set(null);
    }
  },
  async login(email: string, password: string) {
    const result = await request<Session>(endpoints.login, { method: 'POST', body: { email: email.trim(), password } });
    session.set(validSession(result));
  },
  async register(fullName: string, email: string, password: string, acceptTerms: boolean) {
    const result = await request<Session | { message: string }>(endpoints.register, {
      method: 'POST', body: { full_name: fullName.trim(), email: email.trim(), password, accept_terms: acceptTerms },
    });
    if ('access_token' in result) { session.set(validSession(result)); return ''; }
    return result.message || 'Revisa tu correo para confirmar tu cuenta.';
  },
  async logout() {
    const token = current?.access_token;
    session.set(null);
    await persistence;
    if (token) await request(endpoints.logout, { method: 'POST', token });
  },
};
async function renew(): Promise<Session | null> {
  if (refreshTask) return refreshTask;
  const previous = current;
  const version = generation;
  if (!previous) return null;
  refreshTask = (async () => {
    try {
      const next = validSession(await request<Session>(endpoints.refresh, { method: 'POST', body: { refresh_token: previous.refresh_token } }));
      if (version !== generation) return null;
      if (next.user.id !== previous.user.id) { session.set(null); return null; }
      current = next;
      persist(next);
      listeners.forEach((listener) => listener());
      return next;
    } catch (error) {
      if (version === generation && error instanceof ApiError && [400, 401, 403].includes(error.status ?? 0)) session.set(null);
      throw error;
    } finally { if (version === generation) refreshTask = undefined; }
  })();
  return refreshTask;
}
export async function authenticatedRequest<T>(path: string, options: Parameters<typeof request>[1] = {}): Promise<T> {
  const previous = current;
  if (!previous) throw new ApiError('Inicia sesión para ver los datos de tu cuenta.', 401);
  try { return await request<T>(path, { ...options, token: previous.access_token }); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !current || current.user.id !== previous.user.id) throw error;
    const next = current.access_token === previous.access_token ? await renew() : current;
    if (!next) throw error;
    return request<T>(path, { ...options, token: next.access_token });
  }
}
