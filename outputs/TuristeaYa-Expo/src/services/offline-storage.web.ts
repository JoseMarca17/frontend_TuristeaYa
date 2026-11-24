import { safeStorage } from '@/stores/storage';
import type { OfflineRouteSnapshot } from './offline-storage.types';

const WEB_KEY = 'turisteaya.sqlite_web_fallback.offline_routes.v1';

async function readAll(): Promise<OfflineRouteSnapshot[]> {
  try {
    const raw = await safeStorage.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineRouteSnapshot[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: OfflineRouteSnapshot[]) {
  await safeStorage.setItem(WEB_KEY, JSON.stringify(items));
}

export async function readOfflineSnapshots(userId?: string): Promise<OfflineRouteSnapshot[]> {
  const all = await readAll();
  return userId ? all.filter((item) => item.userId === userId) : all;
}

export async function upsertOfflineSnapshot(snapshot: OfflineRouteSnapshot): Promise<void> {
  const all = await readAll();
  const next = [snapshot, ...all.filter((item) => item.routeId !== snapshot.routeId)];
  await writeAll(next);
}

export async function removeOfflineSnapshot(routeId: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((item) => item.routeId !== routeId));
}
