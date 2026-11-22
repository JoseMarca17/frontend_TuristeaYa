import { API_ORIGIN } from './endpoints';

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}
export async function request<T>(path: string, { token, body, method = 'GET', signal }: {
  token?: string; body?: unknown; method?: string; signal?: AbortSignal;
} = {}): Promise<T> {
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== new URL(API_ORIGIN).origin) throw new ApiError('Destino de API no permitido.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 45000);
  try {
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const response = await fetch(url.toString(), {
      method, signal: controller.signal,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : multipart ? body as BodyInit : JSON.stringify(body),
    });
    if (response.status === 204) return null as T;
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      throw new ApiError(typeof detail === 'string' ? detail : Array.isArray(detail)
        ? detail.map((item: { msg: string }) => item.msg).join(' · ') : `Error del servidor (${response.status}).`, response.status);
    }
    if (data === null) throw new ApiError('La API devolvió una respuesta inválida.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError(controller.signal.aborted ? 'La conexión tardó demasiado. Intenta de nuevo.' : 'No se pudo conectar con TuristeaYa.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
