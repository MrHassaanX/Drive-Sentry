import { stationBrand } from './brands.ts';
import { outletName, sourceKey } from './displayName.ts';
import type { Point, Station, StationReference } from './provider.ts';

type Distance = (a: Point, b: Point) => number;

export function stationReferences(station: Station): StationReference[] {
  return station.references ?? [{
    id: station.id, source: station.source, osmRef: station.osmRef, fuelTags: station.fuelTags,
  }];
}

function addressKey(station: Station) {
  const [first, ...rest] = station.address.split(',');
  const prefix = sourceKey(first);
  const titles = [station.name, station.alternateName, station.brand].filter(Boolean) as string[];
  return sourceKey(rest.length && titles.some(title => sourceKey(title) === prefix)
    ? rest.join(',') : station.address);
}

function exactName(station: Station) {
  return sourceKey(outletName(station, station.name) || outletName(station, station.alternateName));
}

function sameAddress(a: Station, b: Station) {
  const key = addressKey(a);
  return key.length >= 12 && key === addressKey(b);
}

function compatible(a: Station, b: Station) {
  const aName = exactName(a);
  const bName = exactName(b);
  const aBrand = sourceKey(stationBrand(a));
  const bBrand = sourceKey(stationBrand(b));
  return (!aName || !bName || aName === bName) && (!aBrand || !bBrand || aBrand === bBrand);
}

function couldShareFootprint(node: Station, way: Station, distance: Distance) {
  return node.osmRef?.startsWith('node/') && way.osmRef?.startsWith('way/') &&
    distance(node, way) <= 0.025 && sameAddress(node, way) && compatible(node, way);
}

export function footprintCandidates(stations: readonly Station[], distance: Distance) {
  const nodes = stations.filter(station => station.osmRef?.startsWith('node/'));
  return stations.filter(way => nodes.some(node => couldShareFootprint(node, way, distance)));
}

function pointInRing(point: Point, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    if ((ay > point.latitude) !== (by > point.latitude) &&
        point.longitude < (bx - ax) * (point.latitude - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function confirmedFootprint(node: Station, way: Station, distance: Distance) {
  const rings = way.footprint;
  return !!rings?.length && couldShareFootprint(node, way, distance) &&
    pointInRing(node, rings[0]) && !rings.slice(1).some(ring => pointInRing(node, ring));
}

function corroborated(a: Station, b: Station, distance: Distance) {
  if (confirmedFootprint(a, b, distance) || confirmedFootprint(b, a, distance)) return true;
  const name = exactName(a);
  const brand = sourceKey(stationBrand(a));
  return a.source !== b.source && !!name && name === exactName(b) &&
    !!brand && brand === sourceKey(stationBrand(b)) && sameAddress(a, b) && distance(a, b) <= 0.03;
}

function merge(preferred: Station, alias: Station) {
  return {
    ...preferred,
    name: preferred.name || alias.name,
    alternateName: preferred.alternateName || alias.alternateName,
    brand: preferred.brand || alias.brand,
    operator: preferred.operator || alias.operator,
    road: preferred.road || alias.road,
    locality: preferred.locality || alias.locality,
    hours: preferred.hours || alias.hours,
    address: preferred.address || alias.address,
    fuels: [...new Set([preferred.fuels, alias.fuels].filter(Boolean))].join(', '),
    references: [...new Map([...stationReferences(alias), ...stationReferences(preferred)]
      .map(reference => [reference.source + '/' + reference.id, reference])).values()],
  };
}

export function resolveOutlets(stations: readonly Station[], distance: Distance) {
  const unique: Station[] = [];
  for (const station of stations) {
    const index = unique.findIndex(item => item.id === station.id ||
      (item.osmRef && item.osmRef === station.osmRef && distance(item, station) <= 0.06));
    if (index === -1) unique.push(station);
    else unique[index] = merge(unique[index], station);
  }
  const matches = unique.map((station, index) =>
    unique.filter((other, i) => index !== i && corroborated(station, other, distance)));
  const matchById = new Map(unique.map((station, index) => [station.id, matches[index]]));
  return unique.flatMap((station, i) => {
    const [other] = matches[i];
    if (matches[i].length !== 1 || matchById.get(other.id)?.length !== 1) return [station];
    // Keep the actual mapped pin and its ID when there is a matching area.
    const pin = station.osmRef?.startsWith('node/') === true;
    const otherPin = other.osmRef?.startsWith('node/') === true;
    const prefer = pin !== otherPin ? pin : station.id < other.id;
    return prefer ? [merge(station, other)] : [];
  });
}
