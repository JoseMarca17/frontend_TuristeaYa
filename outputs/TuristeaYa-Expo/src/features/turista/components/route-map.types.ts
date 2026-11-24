export type RouteMapStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  position?: number;
};

export type RouteMapProps = {
  origin?: { latitude: number; longitude: number } | null;
  stops: RouteMapStop[];
  title?: string;
  height?: number;
  onPickPoint?: (point: { latitude: number; longitude: number }) => void;
};
