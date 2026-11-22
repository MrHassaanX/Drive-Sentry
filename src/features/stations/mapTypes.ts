import type { Point, Radius, Station } from './provider';

export type StationMapProps = {
  center: Point;
  locationLabel?: string;
  showDiagnostics?: boolean;
  radius: Radius;
  stations: Station[];
  selected?: Station;
  onSelect: (id: string) => void;
  onLocate: () => void;
  onSearchHere?: (point: Point) => void;
};
