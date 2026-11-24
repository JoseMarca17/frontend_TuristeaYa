import { API_ORIGIN } from './endpoints';
import { useNetworkStore } from '@/stores/use-network-store';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

let requestSequence = 0;

function inferLabel(method: string, path: string): string {
  const upper = method.toUpperCase();
  const clean = path.split('?')[0];
  if (clean.includes('/auth/login')) return 'Iniciando sesión en Render…';
  if (clean.includes('/auth/register')) return 'Creando cuenta en Render…';
  if (clean.includes('/auth/refresh')) return 'Renovando sesión…';
  if (clean.includes('/auth/logout')) return 'Cerrando sesión…';
  if (clean.includes('/redeem')) return 'Canjeando cupón…';
  if (clean.includes('/reserve')) return 'Confirmando reserva…';
  if (clean.includes('/media/')) return 'Subiendo imagen…';

  const verb = upper === 'POST' ? 'Guardando'
    : upper === 'PATCH' || upper === 'PUT' ? 'Actualizando'
    : upper === 'DELETE' ? 'Eliminando'
    : 'Cargando';

  if (clean.includes('/routes')) return `${verb} rutas…`;
  if (clean.includes('/route-stops')) return `${verb} paradas…`;
  if (clean.includes('/saved-routes')) return `${verb} rutas guardadas…`;
  if (clean.includes('/places')) return `${verb} lugares…`;
  if (clean.includes('/promotions')) return `${verb} cupones y promociones…`;
  if (clean.includes('/experiences')) return `${verb} experiencias…`;
  if (clean.includes('/reviews')) return `${verb} reseñas…`;
  if (clean.includes('/businesses')) return `${verb} negocio…`;
  if (clean.includes('/campaigns')) return `${verb} campañas…`;
  if (clean.includes('/tickets')) return `${verb} tickets…`;
  if (clean.includes('/ticket-messages')) return `${verb} mensajes…`;
  if (clean.includes('/user-access')) return `${verb} permisos…`;
  if (clean.includes('/subscriptions')) return `${verb} suscripciones VIP…`;
  if (clean.includes('/notifications')) return `${verb} notificaciones…`;
  return `${verb} datos en Render…`;
}

export async function request<T>(path: string, {
  token,
  body,
  method = 'GET',
  signal,
  label,
  silent = false,
}: {
  token?: string;
  body?: unknown;
  method?: string;
  signal?: AbortSignal;
  label?: string;
  silent?: boolean;
} = {}): Promise<T> {
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== new URL(API_ORIGIN).origin) throw new ApiError('Destino de API no permitido.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 45000);

  const reqId = `req-${++requestSequence}`;
  const isMutation = method.toUpperCase() !== 'GET';
  const network = useNetworkStore.getState();
  let slowTimer: ReturnType<typeof setTimeout> | undefined;

  if (!silent) {
    network.begin(reqId, label || inferLabel(method, path), isMutation);
    slowTimer = setTimeout(() => {
      useNetworkStore.getState().markSlow(reqId);
    }, 450);
  }

  try {
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const response = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : multipart ? (body as BodyInit) : JSON.stringify(body),
    });
    if (response.status === 204) return null as T;
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      throw new ApiError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: { msg: string }) => item.msg).join(' · ')
            : `Error del servidor (${response.status}).`,
        response.status,
      );
    }
    if (data === null) throw new ApiError('La API devolvió una respuesta inválida.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? 'La conexión tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar con TuristeaYa.',
    );
  } finally {
    clearTimeout(timer);
    if (slowTimer) clearTimeout(slowTimer);
    if (!silent) useNetworkStore.getState().finish(reqId);
    signal?.removeEventListener('abort', abort);
  }
}
