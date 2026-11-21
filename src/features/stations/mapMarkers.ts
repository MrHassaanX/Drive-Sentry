import type { Point, Station } from './provider.ts';

type MapSpan = { latitudeDelta: number; longitudeDelta: number };

export function groupMapMarkers(stations: readonly Station[], span: MapSpan, selectedId?: string) {
  const bins = new Map<string, Station[]>();
  const latitudeStep = span.latitudeDelta / 8;
  const longitudeStep = span.longitudeDelta / 6;
  const group = Number.isFinite(latitudeStep) && Number.isFinite(longitudeStep) &&
    latitudeStep >= 0.0015 && longitudeStep > 0;
  for (const station of stations) {
    const key = group && station.id !== selectedId
      ? Math.floor(station.latitude / latitudeStep) + '/' + Math.floor(station.longitude / longitudeStep)
      : 'station/' + station.id;
    const members = bins.get(key);
    if (members) members.push(station);
    else bins.set(key, [station]);
  }
  return [...bins].map(([key, members]) => {
    if (members.length === 1) {
      const station = members[0];
      return { kind: 'station' as const, key: 'station/' + station.id, station };
    }
    const center: Point = {
      latitude: members.reduce((sum, station) => sum + station.latitude, 0) / members.length,
      longitude: members.reduce((sum, station) => sum + station.longitude, 0) / members.length,
    };
    return { kind: 'cluster' as const, key: 'cluster/' + key, center, members };
  });
}
