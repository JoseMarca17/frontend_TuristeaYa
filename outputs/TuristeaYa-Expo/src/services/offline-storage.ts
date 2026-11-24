import * as SQLite from 'expo-sqlite';
import type { OfflineRouteSnapshot } from './offline-storage.types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('turisteaya_offline.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_routes (
          route_id TEXT PRIMARY KEY NOT NULL,
          server_record_id TEXT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          departure TEXT NOT NULL,
          origin_lat REAL NOT NULL,
          origin_lng REAL NOT NULL,
          total_cost REAL NOT NULL,
          total_duration_minutes INTEGER NOT NULL,
          total_distance_km REAL NOT NULL,
          snapshot_hash TEXT NOT NULL,
          synced_at TEXT NOT NULL,
          pending_sync INTEGER NOT NULL DEFAULT 0,
          payload_json TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function readOfflineSnapshots(userId?: string): Promise<OfflineRouteSnapshot[]> {
  const db = await getDb();
  const rows = userId
    ? await db.getAllAsync<{ payload_json: string }>(
        'SELECT payload_json FROM offline_routes WHERE user_id = ? ORDER BY synced_at DESC',
        [userId],
      )
    : await db.getAllAsync<{ payload_json: string }>(
        'SELECT payload_json FROM offline_routes ORDER BY synced_at DESC',
      );
  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payload_json) as OfflineRouteSnapshot;
      } catch {
        return null;
      }
    })
    .filter((item): item is OfflineRouteSnapshot => Boolean(item));
}

export async function upsertOfflineSnapshot(snapshot: OfflineRouteSnapshot): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO offline_routes (
      route_id, server_record_id, user_id, name, departure,
      origin_lat, origin_lng, total_cost, total_duration_minutes,
      total_distance_km, snapshot_hash, synced_at, pending_sync, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.routeId,
      snapshot.serverRecordId || null,
      snapshot.userId,
      snapshot.name,
      snapshot.departure,
      snapshot.originLat,
      snapshot.originLng,
      snapshot.totalCost,
      snapshot.totalDurationMinutes,
      snapshot.totalDistanceKm,
      snapshot.snapshotHash,
      snapshot.syncedAt,
      snapshot.pendingSync ? 1 : 0,
      JSON.stringify(snapshot),
    ],
  );
}

export async function removeOfflineSnapshot(routeId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM offline_routes WHERE route_id = ?', [routeId]);
}
