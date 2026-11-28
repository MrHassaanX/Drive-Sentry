import type { SQLiteDatabase } from 'expo-sqlite';
import { withDatabaseTransaction } from '../../db/transaction.ts';
import type { Point } from '../stations/provider.ts';
import { isValidCoordinate, MAX_ROUTE_GEOMETRY_POINTS, type TripRoute } from './routing.ts';

export type { TripRoute } from './routing.ts';

type SavedStation = {
  id: string;
  brand?: string;
  source?: string;
  fuelTags?: string[];
  observedAt?: string;
};

export type TripWaypoint = Point & {
  label: string;
  kind: 'origin' | 'destination' | 'via' | 'fuel';
  station?: SavedStation;
};

export type TripAssumptions = {
  fuelType?: 'petrol' | 'diesel' | 'cng';
  efficiency?: number;
  efficiencySource?: string;
  pricePaisePerUnit?: number;
  priceSource?: string;
  priceCoverage?: string;
  priceObservedAt?: string;
  rangeKm?: number;
  availableFuel?: number;
};

export type TripDraft = {
  vehicleId: number;
  title: string;
  waypoints: TripWaypoint[];
  assumptions: TripAssumptions;
  route?: TripRoute | null;
  baseRoute?: TripRoute | null;
};

export type TripPlan = TripDraft & { id: number; createdAt: string; updatedAt: string };
type TripSummary = Pick<TripPlan, 'id' | 'vehicleId' | 'title' | 'createdAt' | 'updatedAt'> & { distanceMetres: number | null };
type TripRow = Omit<TripSummary, 'distanceMetres'> & {
  fuelType: TripAssumptions['fuelType'] | null;
  efficiency: number | null;
  efficiencySource: string | null;
  pricePaisePerUnit: number | null;
  priceSource: string | null;
  priceCoverage: string | null;
  priceObservedAt: string | null;
  rangeKm: number | null;
  availableFuel: number | null;
  waypointsJson: string;
  routesJson: string;
};

const MAX_WAYPOINTS = 10;

function checkedText(value: string | undefined, label: string, limit: number) {
  const cleaned = value?.trim();
  if (cleaned && cleaned.length > limit) throw new Error(`${label} is too long.`);
  return cleaned || undefined;
}

function tripTitle(value: string) {
  const title = checkedText(value, 'Trip name', 100);
  if (!title) throw new Error('Enter a trip name.');
  return title;
}

function checkedDate(value: string | undefined, label: string) {
  if (value === undefined) return undefined;
  if (value.length > 35 || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label} date.`);
  return value;
}

function routeInput(route: TripRoute | null | undefined) {
  if (!route) return undefined;
  const id = checkedText(route.id, 'Route ID', 150);
  const provider = checkedText(route.provider, 'Route provider', 100);
  const attribution = checkedText(route.attribution, 'Route attribution', 300);
  if (!id || !provider || !attribution || !checkedDate(route.calculatedAt, 'route calculation') ||
      !Number.isFinite(route.distanceMetres) || route.distanceMetres <= 0 ||
      !Number.isFinite(route.durationSeconds) || route.durationSeconds <= 0 ||
      !Array.isArray(route.geometry) || route.geometry.length < 2 ||
      route.geometry.length > MAX_ROUTE_GEOMETRY_POINTS || !route.geometry.every(isValidCoordinate)) {
    throw new Error('The trip route could not be saved because its calculation is incomplete.');
  }
  return { ...route, id, provider, attribution, geometry: route.geometry.map(({ latitude, longitude }) => ({ latitude, longitude })) };
}

function normalizeDraft(draft: TripDraft): TripDraft {
  if (!Number.isSafeInteger(draft.vehicleId) || draft.vehicleId <= 0) throw new Error('Select a vehicle for this trip.');
  if (draft.waypoints.length < 2 || draft.waypoints.length > MAX_WAYPOINTS ||
      draft.waypoints[0].kind !== 'origin' || draft.waypoints.at(-1)?.kind !== 'destination') {
    throw new Error('Enter an origin and destination and at most eight stops.');
  }
  const stationIds = new Set<string>();
  const waypoints = draft.waypoints.map((waypoint, position, all) => {
    const { kind, latitude, longitude } = waypoint;
    const label = checkedText(waypoint.label, 'Place name', 300);
    if (!label || !isValidCoordinate(waypoint) ||
        (position > 0 && position < all.length - 1 && kind !== 'via' && kind !== 'fuel') ||
        (kind !== 'fuel' && waypoint.station)) throw new Error('Choose valid stops in the order you will visit them.');
    if (kind !== 'fuel') return { kind, latitude, longitude, label };
    const id = checkedText(waypoint.station?.id, 'Station ID', 300);
    if (!id || stationIds.has(id)) throw new Error('Choose a distinct fuel station for each refuelling stop.');
    stationIds.add(id);
    const station = {
      id,
      brand: checkedText(waypoint.station?.brand, 'Station brand', 150),
      source: checkedText(waypoint.station?.source, 'Station source', 250),
      fuelTags: waypoint.station?.fuelTags?.slice(0, 24).map(tag => checkedText(tag, 'Fuel tag', 100)).filter((tag): tag is string => !!tag),
      observedAt: checkedDate(waypoint.station?.observedAt, 'station observation'),
    };
    return { kind, latitude, longitude, label, station };
  });
  const { fuelType, efficiency, pricePaisePerUnit, rangeKm, availableFuel } = draft.assumptions;
  if ((fuelType !== undefined && !['petrol', 'diesel', 'cng'].includes(fuelType)) ||
      (efficiency !== undefined && (!Number.isFinite(efficiency) || efficiency <= 0)) ||
      (pricePaisePerUnit !== undefined && (!Number.isSafeInteger(pricePaisePerUnit) || pricePaisePerUnit <= 0)) ||
      [rangeKm, availableFuel].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    throw new Error('Enter valid fuel, efficiency, price and remaining range assumptions.');
  }
  const assumptions = {
    fuelType, efficiency, pricePaisePerUnit, rangeKm, availableFuel,
    efficiencySource: checkedText(draft.assumptions.efficiencySource, 'Efficiency source', 200),
    priceSource: checkedText(draft.assumptions.priceSource, 'Price source', 200),
    priceCoverage: checkedText(draft.assumptions.priceCoverage, 'Price coverage', 200),
    priceObservedAt: checkedDate(draft.assumptions.priceObservedAt, 'price observation'),
  };
  return { ...draft, title: tripTitle(draft.title), waypoints, assumptions,
    route: routeInput(draft.route), baseRoute: routeInput(draft.baseRoute) };
}

export async function listTrips(db: SQLiteDatabase, vehicleId: number) {
  return db.getAllAsync<TripSummary>(`SELECT p.id, p.vehicle_id AS vehicleId, p.title,
      p.created_at AS createdAt, p.updated_at AS updatedAt, r.distance_metres AS distanceMetres
    FROM trip_plans p LEFT JOIN trip_routes r ON r.trip_id = p.id AND r.role = 'active'
    WHERE p.vehicle_id = ? ORDER BY p.updated_at DESC, p.id DESC`, vehicleId);
}

export async function getTrip(db: SQLiteDatabase, vehicleId: number, tripId: number): Promise<TripPlan | null> {
  // A single read holds one SQLite snapshot, including the ordered stops and both route calculations.
  const row = await db.getFirstAsync<TripRow>(`SELECT p.id, p.vehicle_id AS vehicleId, p.title,
    p.created_at AS createdAt, p.updated_at AS updatedAt, p.fuel_type AS fuelType, p.efficiency,
    p.efficiency_source AS efficiencySource, p.price_paise_per_unit AS pricePaisePerUnit, p.price_source AS priceSource,
    p.price_coverage AS priceCoverage, p.price_observed_at AS priceObservedAt, p.range_km AS rangeKm,
    p.available_fuel AS availableFuel,
    (SELECT json_group_array(json_object('kind', w.kind, 'label', w.label, 'latitude', w.latitude,
      'longitude', w.longitude, 'station', CASE WHEN w.station_id IS NOT NULL
        THEN json_object('id', w.station_id, 'brand', w.brand, 'source', w.source,
          'fuelTags', json(w.fuel_tags), 'observedAt', w.observed_at) END))
      FROM (SELECT trip_waypoints.*, trip_refuel_stops.station_id, trip_refuel_stops.brand,
          trip_refuel_stops.source, trip_refuel_stops.fuel_tags, trip_refuel_stops.observed_at
        FROM trip_waypoints LEFT JOIN trip_refuel_stops USING (trip_id, position)
        WHERE trip_waypoints.trip_id = p.id ORDER BY trip_waypoints.position) AS w) AS waypointsJson,
    (SELECT json_group_array(json_object('role', r.role, 'id', r.route_id, 'provider', r.provider,
      'attribution', r.attribution, 'calculatedAt', r.calculated_at, 'distanceMetres', r.distance_metres,
      'durationSeconds', r.duration_seconds, 'geometry', json(r.geometry)))
      FROM trip_routes r WHERE r.trip_id = p.id) AS routesJson
    FROM trip_plans p WHERE p.vehicle_id = ? AND p.id = ?`, vehicleId, tripId);
  if (!row) return null;
  const { id, vehicleId: owner, title, createdAt, updatedAt, waypointsJson, routesJson, ...values } = row;
  const assumptions = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)) as TripAssumptions;
  const waypoints = (JSON.parse(waypointsJson) as TripWaypoint[]).map(({ station, ...waypoint }) => station
    ? { ...waypoint, station: Object.fromEntries(Object.entries(station).filter(([, value]) => value !== null)) as SavedStation }
    : waypoint);
  const routes = (JSON.parse(routesJson) as (TripRoute & { role: 'base' | 'active' })[])
    .reduce<Partial<Record<'base' | 'active', TripRoute>>>((result, { role, ...route }) => ({ ...result, [role]: route }), {});
  return { id, vehicleId: owner, title, createdAt, updatedAt, assumptions, waypoints,
    route: routes.active, baseRoute: routes.base };
}

async function writeTrip(db: SQLiteDatabase, draft: TripDraft, tripId: number | undefined) {
  const { title, assumptions, vehicleId, waypoints, route, baseRoute } = draft;
  const savedAt = new Date().toISOString();
  const values = [title, assumptions.fuelType ?? null, assumptions.efficiency ?? null,
    assumptions.efficiencySource ?? null, assumptions.pricePaisePerUnit ?? null, assumptions.priceSource ?? null,
    assumptions.priceCoverage ?? null, assumptions.priceObservedAt ?? null, assumptions.rangeKm ?? null,
    assumptions.availableFuel ?? null, savedAt];
  let id: number;
  if (tripId === undefined) {
    const newTrip = await db.runAsync(`INSERT INTO trip_plans(title, fuel_type, efficiency, efficiency_source,
      price_paise_per_unit, price_source, price_coverage, price_observed_at, range_km, available_fuel, updated_at,
      vehicle_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...values, vehicleId, savedAt);
    id = newTrip.lastInsertRowId;
  } else {
    const updated = await db.runAsync(`UPDATE trip_plans SET title = ?, fuel_type = ?, efficiency = ?, efficiency_source = ?,
      price_paise_per_unit = ?, price_source = ?, price_coverage = ?, price_observed_at = ?, range_km = ?,
      available_fuel = ?, updated_at = ? WHERE vehicle_id = ? AND id = ?`, ...values, vehicleId, tripId);
    if (!updated.changes) throw new Error('That trip is no longer available for this vehicle.');
    id = tripId;
    await db.runAsync('DELETE FROM trip_waypoints WHERE trip_id = ?', id);
    await db.runAsync('DELETE FROM trip_routes WHERE trip_id = ?', id);
  }

  for (const [position, waypoint] of waypoints.entries()) {
    await db.runAsync(`INSERT INTO trip_waypoints(trip_id, position, kind, label, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?)`, id, position, waypoint.kind, waypoint.label, waypoint.latitude, waypoint.longitude);
    const station = waypoint.station;
    if (station) {
      await db.runAsync(`INSERT INTO trip_refuel_stops(trip_id, position, station_id, brand, source, fuel_tags, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, id, position, station.id, station.brand ?? null, station.source ?? null,
      station.fuelTags ? JSON.stringify(station.fuelTags) : null, station.observedAt ?? null);
    }
  }
  for (const [role, saved] of [['base', baseRoute], ['active', route]] as const) {
    if (!saved) continue;
    await db.runAsync(`INSERT INTO trip_routes(trip_id, role, route_id, provider, attribution, calculated_at,
      distance_metres, duration_seconds, geometry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, role, saved.id, saved.provider,
    saved.attribution, saved.calculatedAt, saved.distanceMetres, saved.durationSeconds, JSON.stringify(saved.geometry));
  }
  return id;
}

export async function saveTrip(db: SQLiteDatabase, draft: TripDraft, tripId?: number, transaction = withDatabaseTransaction) {
  const normalized = normalizeDraft(draft);
  return transaction(db, connection => writeTrip(connection, normalized, tripId));
}

export async function renameTrip(db: SQLiteDatabase, vehicleId: number, tripId: number, title: string) {
  const updated = await db.runAsync('UPDATE trip_plans SET title = ?, updated_at = ? WHERE vehicle_id = ? AND id = ?',
    tripTitle(title), new Date().toISOString(), vehicleId, tripId);
  if (!updated.changes) throw new Error('That trip is no longer available for this vehicle.');
}

export async function deleteTrip(db: SQLiteDatabase, vehicleId: number, tripId: number) {
  const deleted = await db.runAsync('DELETE FROM trip_plans WHERE vehicle_id = ? AND id = ?', vehicleId, tripId);
  if (!deleted.changes) throw new Error('That trip is no longer available for this vehicle.');
}

export async function duplicateTrip(db: SQLiteDatabase, vehicleId: number, tripId: number, title?: string,
  transaction = withDatabaseTransaction) {
  return transaction(db, async connection => {
    const trip = await getTrip(connection, vehicleId, tripId);
    if (!trip) throw new Error('That trip is no longer available for this vehicle.');
    const draft = normalizeDraft({ ...trip, title: title ?? `${trip.title.slice(0, 93).trimEnd()} (copy)` });
    return writeTrip(connection, draft, undefined);
  });
}
