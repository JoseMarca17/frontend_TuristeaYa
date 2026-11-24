export type OfflineStopSnapshot = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedCost: number;
  visitMinutes: number;
  openingHoursText?: string;
};

export type OfflineRouteSnapshot = {
  routeId: string;
  serverRecordId?: string;
  userId: string;
  name: string;
  departure: string;
  originLat: number;
  originLng: number;
  totalCost: number;
  totalDurationMinutes: number;
  totalDistanceKm: number;
  snapshotHash: string;
  syncedAt: string;
  pendingSync: boolean;
  hasServerChanges?: boolean;
  changeNotes?: string[];
  stops: OfflineStopSnapshot[];
};
