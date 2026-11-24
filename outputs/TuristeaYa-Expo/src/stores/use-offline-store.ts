import { create } from 'zustand';
import { readOfflineSnapshots, removeOfflineSnapshot, upsertOfflineSnapshot } from '@/services/offline-storage';
import type { OfflineRouteSnapshot } from '@/services/offline-storage.types';
import { createRecord, deleteRecord } from '@/services/management';
import { detectRouteSnapshotDrift } from '@/services/domain-rules';

type OfflineState = {
  items: OfflineRouteSnapshot[];
  loading: boolean;
  syncing: boolean;
  lastGlobalSyncAt: string | null;
  error: string;
  loadSnapshots: (userId?: string) => Promise<void>;
  saveRouteOffline: (snapshot: OfflineRouteSnapshot, canSyncRemote: boolean) => Promise<OfflineRouteSnapshot>;
  deleteRouteOffline: (routeId: string, canSyncRemote: boolean) => Promise<void>;
  syncAndDetectChanges: (
    livePlaces: { id: string; name: string; estimatedCost: number; visitMinutes: number; published?: boolean }[],
    canSyncRemote: boolean,
  ) => Promise<number>;
};

export const useOfflineStore = create<OfflineState>((set, get) => ({
  items: [],
  loading: false,
  syncing: false,
  lastGlobalSyncAt: null,
  error: '',

  loadSnapshots: async (userId) => {
    set({ loading: true, error: '' });
    try {
      const items = await readOfflineSnapshots(userId);
      const latestSync = items[0]?.syncedAt || null;
      set({ items, loading: false, lastGlobalSyncAt: latestSync });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudieron leer las descargas offline.',
      });
    }
  },

  saveRouteOffline: async (snapshot, canSyncRemote) => {
    let serverRecordId = snapshot.serverRecordId;
    let pendingSync = snapshot.pendingSync;
    if (canSyncRemote && !snapshot.userId.startsWith('demo-') && !snapshot.routeId.startsWith('local-')) {
      try {
        const created = await createRecord<{ id: string }>(
          'offline-downloads',
          {
            user_id: snapshot.userId,
            route_id: snapshot.routeId,
            snapshot: {
              name: snapshot.name,
              totalCost: snapshot.totalCost,
              totalDurationMinutes: snapshot.totalDurationMinutes,
              snapshotHash: snapshot.snapshotHash,
              stops: snapshot.stops,
            },
          },
          'Sincronizando descarga offline...',
        );
        serverRecordId = created?.id || serverRecordId;
        pendingSync = false;
      } catch {
        // Guardamos en SQLite local con pendingSync=true para reintentar al recuperar conexión/permiso.
        pendingSync = true;
      }
    }

    const updated: OfflineRouteSnapshot = {
      ...snapshot,
      serverRecordId,
      pendingSync,
      syncedAt: new Date().toISOString(),
    };
    await upsertOfflineSnapshot(updated);
    set((state) => ({
      items: [updated, ...state.items.filter((item) => item.routeId !== updated.routeId)],
      lastGlobalSyncAt: updated.syncedAt,
    }));
    return updated;
  },

  deleteRouteOffline: async (routeId, canSyncRemote) => {
    const target = get().items.find((item) => item.routeId === routeId);
    if (canSyncRemote && target?.serverRecordId) {
      try {
        await deleteRecord('offline-downloads', target.serverRecordId, 'Eliminando descarga offline...');
      } catch {
        // Ignorar si ya fue eliminado en el servidor o no había conexión; eliminamos del dispositivo.
      }
    }
    await removeOfflineSnapshot(routeId);
    set((state) => ({
      items: state.items.filter((item) => item.routeId !== routeId),
    }));
  },

  syncAndDetectChanges: async (livePlaces, canSyncRemote) => {
    set({ syncing: true, error: '' });
    const current = get().items;
    let changedCount = 0;
    const nowIso = new Date().toISOString();
    const updatedList: OfflineRouteSnapshot[] = [];

    for (const item of current) {
      let nextItem = { ...item };
      if (nextItem.pendingSync && canSyncRemote && !nextItem.userId.startsWith('demo-') && !nextItem.routeId.startsWith('local-')) {
        try {
          const created = await createRecord<{ id: string }>(
            'offline-downloads',
            {
              user_id: nextItem.userId,
              route_id: nextItem.routeId,
              snapshot: {
                name: nextItem.name,
                snapshotHash: nextItem.snapshotHash,
                stops: nextItem.stops,
              },
            },
            'Sincronizando descargas pendientes...',
          );
          nextItem.serverRecordId = created?.id || nextItem.serverRecordId;
          nextItem.pendingSync = false;
        } catch {
          // Mantener pendiente para siguiente intento
        }
      }

      if (livePlaces.length > 0) {
        const drift = detectRouteSnapshotDrift(
          {
            routeId: nextItem.routeId,
            version: 1,
            updatedAt: nextItem.syncedAt,
            snapshotHash: nextItem.snapshotHash,
            stops: nextItem.stops,
          },
          livePlaces,
        );
        nextItem.hasServerChanges = drift.changed;
        nextItem.changeNotes = drift.reasons;
        if (drift.changed) changedCount += 1;
      }

      nextItem.syncedAt = nowIso;
      await upsertOfflineSnapshot(nextItem);
      updatedList.push(nextItem);
    }

    set({ items: updatedList, syncing: false, lastGlobalSyncAt: nowIso });
    return changedCount;
  },
}));
