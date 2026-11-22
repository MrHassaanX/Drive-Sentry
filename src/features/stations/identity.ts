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

function conflictingIdentity(a: Station, b: Station) {
  const aBrand = sourceKey(stationBrand(a));
  const bBrand = sourceKey(stationBrand(b));
  if (aBrand && bBrand && aBrand !== bBrand) return true;
  const aIds = stationReferences(a).flatMap(ref => ref.omcOutlet ? [ref.omcOutlet] : []);
  const bIds = stationReferences(b).flatMap(ref => ref.omcOutlet ? [ref.omcOutlet] : []);
  return aIds.length > 0 && bIds.length > 0 && !aIds.some(id => bIds.includes(id));
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
    const [aLon, aLat] = ring[j];
    const [bLon, bLat] = ring[i];
    if ((aLat > point.latitude) !== (bLat > point.latitude) &&
        point.longitude < (bLon - aLon) * (point.latitude - aLat) / (bLat - aLat) + aLon) inside = !inside;
  }
  return inside;
}

function confirmedFootprint(node: Station, way: Station, distance: Distance) {
  const rings = way.footprint;
  return !!rings?.length && couldShareFootprint(node, way, distance) &&
    pointInRing(node, rings[0]) && !rings.slice(1).some(ring => pointInRing(node, ring));
}

function corroborated(a: Station, b: Station, distance: Distance) {
  if (conflictingIdentity(a, b)) return false;
  if (confirmedFootprint(a, b, distance) || confirmedFootprint(b, a, distance)) return true;
  return a.source !== b.source && corroboratedOutlet(a, b, distance);
}

function listingInFootprint(listing: Station, mapped: Station, distance: Distance) {
  const rings = mapped.footprint;
  const brand = stationBrand(listing);
  return !!listing.outletListing && !mapped.outletListing && !!rings?.length &&
    !!brand && brand === stationBrand(mapped) && compatible(listing, mapped) &&
    distance(listing, mapped) <= 0.06 && pointInRing(listing, rings[0]) &&
    !rings.slice(1).some(ring => pointInRing(listing, ring));
}

export function corroboratedOutlet(a: Station, b: Station, distance: Distance) {
  if (conflictingIdentity(a, b)) return false;
  const first = stationReferences(a).map(ref => ref.omcOutlet).filter(Boolean);
  const second = stationReferences(b).map(ref => ref.omcOutlet).filter(Boolean);
  if (first.length && second.length) {
    return first.some(id => second.includes(id)) && distance(a, b) <= 0.06;
  }
  if (listingInFootprint(a, b, distance) || listingInFootprint(b, a, distance)) return true;
  const name = exactName(a);
  const brand = sourceKey(stationBrand(a));
  return !!name && name === exactName(b) &&
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
    city: preferred.city || alias.city,
    hours: preferred.hours || alias.hours,
    address: preferred.address || alias.address,
    outletListing: preferred.outletListing ?? alias.outletListing,
    footprint: preferred.footprint ?? alias.footprint,
    fuels: [...new Set([preferred.fuels, alias.fuels].filter(Boolean))].join(', '),
    references: [...new Map([...stationReferences(alias), ...stationReferences(preferred)]
      .map(reference => [reference.source + '/' + reference.id, reference])).values()],
  };
}

function footprintTrios(stations: Station[], distance: Distance) {
  const groups = stations.flatMap(area => {
    const rings = area.footprint;
    if (area.outletListing || !rings?.length) return [];
    const inside = stations.filter(point => point !== area && !point.footprint &&
      Math.abs(point.latitude - area.latitude) < 0.00055 && distance(point, area) <= 0.06 &&
      pointInRing(point, rings[0]) && !rings.slice(1).some(ring => pointInRing(point, ring)));
    const [listing, ...otherListings] = inside.filter(point => point.outletListing);
    const [node, ...otherNodes] = inside.filter(point => !point.outletListing && point.osmRef?.startsWith('node/'));
    if (!listing || otherListings.length || !node || otherNodes.length || !stationBrand(listing) ||
        stationBrand(listing) !== stationBrand(node) ||
        !compatible(listing, node) || !compatible(listing, area) || !compatible(node, area)) return [];
    return [{ listing, node, area }];
  });
  const membership = new Map<string, number>();
  for (const { listing, node, area } of groups) for (const place of [listing, node, area]) {
    membership.set(place.id, (membership.get(place.id) ?? 0) + 1);
  }
  const replacements = new Map<string, Station | undefined>();
  for (const { listing, node, area } of groups) {
    if ([listing, node, area].some(place => membership.get(place.id) !== 1)) continue;
    replacements.set(listing.id, merge(merge(listing, node), area));
    replacements.set(node.id, undefined);
    replacements.set(area.id, undefined);
  }
  return stations.flatMap(place => {
    const replacement = replacements.has(place.id) ? replacements.get(place.id) : place;
    return replacement ? [replacement] : [];
  });
}

export function resolveOutlets(stations: readonly Station[], distance: Distance) {
  const uniqueRecords: Station[] = [];
  const ids = new Map<string, number>();
  const osm = new Map<string, number[]>();
  for (const station of stations) {
    const sameId = ids.get(station.id);
    const candidates = station.osmRef ? osm.get(station.osmRef) ?? [] : [];
    const index = sameId ?? candidates.find(i => !conflictingIdentity(uniqueRecords[i], station) && distance(uniqueRecords[i], station) <= 0.06);
    if (index === undefined) {
      ids.set(station.id, uniqueRecords.length);
      if (station.osmRef) osm.set(station.osmRef, [...candidates, uniqueRecords.length]);
      uniqueRecords.push(station);
    } else if (!conflictingIdentity(uniqueRecords[index], station)) {
      ids.set(station.id, index);
      uniqueRecords[index] = merge(uniqueRecords[index], station);
    }
  }
  const unique = footprintTrios(uniqueRecords, distance);
  // All corroboration paths are bounded to 60 m. Limit candidate pairs by
  // latitude before evaluating the more expensive identity and geometry rules.
  const ordered = unique.map((station, index) => ({ station, index }))
    .sort((a, b) => a.station.latitude - b.station.latitude);
  const matches = unique.map((): Station[] => []);
  for (let i = 0; i < ordered.length; i++) {
    const first = ordered[i];
    for (let j = i + 1; j < ordered.length; j++) {
      const next = ordered[j];
      if (next.station.latitude - first.station.latitude > 0.00055) break;
      if (corroborated(first.station, next.station, distance)) {
        matches[first.index].push(next.station);
        matches[next.index].push(first.station);
      }
    }
  }
  const matchById = new Map(unique.map((station, index) => [station.id, matches[index]]));
  return unique.flatMap((station, i) => {
    const [other] = matches[i];
    if (matches[i].length !== 1 || matchById.get(other.id)?.length !== 1) return [station];
    // Keep the actual mapped pin and its ID when there is a matching area.
    const pin = station.osmRef?.startsWith('node/') === true;
    const otherPin = other.osmRef?.startsWith('node/') === true;
    const catalogue = !!station.outletListing;
    const otherCatalogue = !!other.outletListing;
    const prefer = catalogue !== otherCatalogue ? catalogue : pin !== otherPin ? pin : station.id < other.id;
    return prefer ? [merge(station, other)] : [];
  });
}
