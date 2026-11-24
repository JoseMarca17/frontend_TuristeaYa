import { listRecords } from './catalog';
import { endpoints } from './endpoints';
import { authenticatedRequest, session } from './session';

export async function requireRole(roles: string[], signal?: AbortSignal) {
  const user = session.get()?.user;
  if (!user) throw new Error('Inicia sesión para abrir este panel.');
  const access = await listRecords('user-access', { private: true, signal, filters: { user_id: user.id } });
  if (!access.some((row) => row.user_id === user.id && row.status === 'active' && roles.includes(String(row.role)))) {
    throw new Error(`Tu cuenta no tiene permisos para abrir este panel (requiere rol: ${roles.join(' o ')}).`);
  }
  return user.id;
}

export const createRecord = <T = Record<string, unknown>>(entity: string, body: Record<string, unknown>, label?: string) =>
  authenticatedRequest<T>(endpoints.resource(entity), { method: 'POST', body, label });

export const updateRecord = <T = Record<string, unknown>>(entity: string, id: string, body: Record<string, unknown>, label?: string) =>
  authenticatedRequest<T>(endpoints.record(entity, id), { method: 'PATCH', body, label });

export const deleteRecord = (entity: string, id: string, label?: string) =>
  authenticatedRequest<null>(endpoints.record(entity, id), { method: 'DELETE', label });
