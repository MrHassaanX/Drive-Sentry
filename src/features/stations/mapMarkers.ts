import { distance, type Point, type Station } from './provider.ts';

type MapSpan = { latitudeDelta: number; longitudeDelta: number };

export function selectedMapRadius(stations: readonly Station[], selected: Station) {
  const nearest = stations.reduce((km, station) => station.id === selected.id
    ? km : Math.min(km, distance(selected, station)), 1);
  return Math.max(0.02, Math.min(1, nearest * 2.2));
}

export function groupMapMarkers(stations: readonly Station[], span: MapSpan, selectedId?: string) {
  const bins: Station[][] = [];
  const latitudeStep = span.latitudeDelta / 8;
  const longitudeStep = span.longitudeDelta / 6;
  const group = Number.isFinite(latitudeStep) && Number.isFinite(longitudeStep) &&
    latitudeStep >= 0.0015 && longitudeStep > 0;
  for (const station of stations) {
    // A pair straddling a grid line can still look like one pin.
    const members = group && station.id !== selectedId ? bins.find(items => items.every(item =>
      item.id !== selectedId &&
      Math.abs(station.latitude - item.latitude) <= latitudeStep &&
      Math.abs(station.longitude - item.longitude) <= longitudeStep)) : undefined;
    if (members) members.push(station);
    else bins.push([station]);
  }
  return bins.map(members => {
    if (members.length === 1) {
      const station = members[0];
      return { kind: 'station' as const, key: 'station/' + station.id, station };
    }
    const center: Point = {
      latitude: members.reduce((sum, station) => sum + station.latitude, 0) / members.length,
      longitude: members.reduce((sum, station) => sum + station.longitude, 0) / members.length,
    };
    return { kind: 'cluster' as const, key: 'cluster/' + members[0].id, center, members };
  });
}
