import type { Point, Radius, Station } from './provider';
import type { CatalogueCoverage } from './indiaFuelPumps';

export type StationMapProps = {
  center: Point;
  locationLabel?: string;
  accuracy?: number | null;
  overview?: boolean;
  coverage?: CatalogueCoverage;
  active?: boolean;
  showDiagnostics?: boolean;
  radius: Radius;
  stations: Station[];
  selected?: Station;
  onSelect: (id: string) => void;
  onLocate: () => void;
  onSearchHere?: (point: Point) => void;
};
