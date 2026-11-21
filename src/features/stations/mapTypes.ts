import type { Point, Radius, Station } from './provider';

export type StationMapProps = {
  center: Point;
  searchSelected: boolean;
  deviceLocation?: Point;
  radius: Radius;
  stations: Station[];
  selected?: Station;
  onSelect: (id: string) => void;
};
