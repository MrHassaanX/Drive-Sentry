import type { Point } from '../stations/provider';

export type TripMapMarker = Point & { id: string; label: string; symbol: string };
export type TripMapProps = {
  geometry: readonly Point[];
  waypoints: readonly TripMapMarker[];
  stations?: readonly TripMapMarker[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (point: Point) => void;
};
