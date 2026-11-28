import { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { listFuelEntries } from '../fuel/repository';
import type { FuelEntry } from '../fuel/types';
import { readMetroPrices } from '../fuelPrices/repository';
import { loadPrices } from '../fuelPrices/service';
import type { CityFuelPrice } from '../fuelPrices/model';
import { indiaCities } from '../stations/indiaCities';
import { distance } from '../stations/provider';
import { stationBrand } from '../stations/brands';
import { stationDisplay } from '../stations/displayName';
import { stationReferences } from '../stations/identity';
import { recordedEfficiency, parseTripDecimal, resolveTripFuel, tripEstimate, tripRange, type TripFuel, type TripPrice } from './estimates';
import { MAX_ROUTE_WAYPOINTS, routingProviderForProfile, type TripRoute } from './routing';
import { insertFuelStops, searchTripCorridor, type CorridorResult, type CorridorStation } from './corridor';
import { deleteTrip, duplicateTrip, getTrip, listTrips, saveTrip, type TripPlan, type TripWaypoint } from './repository';

const profile = Constants.expoConfig?.extra?.buildProfile;
const provider = routingProviderForProfile(profile);
const text = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
type Points = { origin?: TripWaypoint; destination?: TripWaypoint; middle: TripWaypoint[] };
const emptyPoints: Points = { middle: [] };
function ordered(points: Points): TripWaypoint[] | undefined {
  if (points.origin && points.destination) return [points.origin, ...points.middle, points.destination];
}
const numberText = (value?: number) => value === undefined ? '' : String(value);
type Routes = { base?: TripRoute; active?: TripRoute; alternatives?: TripRoute[]; saved?: boolean };

export function useTripPlanner(vehicleParam?: string) {
  const db = useSQLiteContext();
  const { vehicles, selectedVehicle } = useSelectedVehicle();
  const [vehicleChoice, setVehicleChoice] = useState(vehicleParam ?? '');
  const vehicle = vehicles.find(item => String(item.id) === vehicleChoice) ?? (!vehicleChoice ? selectedVehicle : undefined);
  const vehicleId = vehicle?.id;
  const [points, setPoints] = useState<Points>(emptyPoints);
  const [routes, setRoutes] = useState<Routes>({});
  const [title, setTitle] = useState('');
  const [planId, setPlanId] = useState<number>();
  const [savedTrips, setSavedTrips] = useState<Awaited<ReturnType<typeof listTrips>>>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [routeError, setRouteError] = useState('');
  const [routing, setRouting] = useState(false);
  const request = useRef<AbortController>(undefined);
  const [radius, setRadius] = useState<3 | 5>(3);
  const [corridor, setCorridor] = useState<CorridorResult>();
  const [searching, setSearching] = useState(false);
  const [stationError, setStationError] = useState('');
  const stationRequest = useRef<AbortController>(undefined);
  const [selectedStation, setSelectedStation] = useState('');
  const [fuelChoice, setFuelChoice] = useState<TripFuel>();
  const [mileageText, setMileageText] = useState('');
  const [savedEfficiency, setSavedEfficiency] = useState<{ value: number; source?: string }>();
  const [manualPrice, setManualPrice] = useState('');
  const [referencePrice, setReferencePrice] = useState<TripPrice>();
  const [rangeText, setRangeText] = useState('');
  const [availableText, setAvailableText] = useState('');
  const [prices, setPrices] = useState<CityFuelPrice[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceNotice, setPriceNotice] = useState('');
  const [fuelHistory, setFuelHistory] = useState<{ id: number; entries: FuelEntry[] }>();
  const [saving, setSaving] = useState(false);
  const storageBusy = useRef(false);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    void listFuelEntries(db, vehicleId).then(entries => { if (active) setFuelHistory({ id: vehicleId, entries }); }).catch(() => {});
    return () => { active = false; };
  }, [db, vehicleId]);
  useEffect(() => {
    let active = true;
    void readMetroPrices(db).then(result => { if (active) setPrices(result); }).catch(() => {});
    return () => { active = false; };
  }, [db]);
  useEffect(() => {
    if (!showSaved || !vehicleId) return;
    let active = true;
    void listTrips(db, vehicleId).then(items => { if (active) setSavedTrips(items); })
      .catch(() => { if (active) setNotice('Saved trips could not be read.'); });
    return () => { active = false; };
  }, [db, vehicleId, showSaved]);
  useEffect(() => () => { request.current?.abort(); stationRequest.current?.abort(); }, []);

  const fuelStops = points.middle.filter(item => item.kind === 'fuel');
  const route = routes.active ?? routes.base;
  const fuel = resolveTripFuel(vehicle?.fuel_type, fuelChoice);
  const recorded = useMemo(() => fuel && fuelHistory?.id === vehicleId
    ? recordedEfficiency(fuelHistory?.entries ?? [], fuel) : undefined, [fuel, fuelHistory, vehicleId]);
  const typedEfficiency = savedEfficiency?.value ?? parseTripDecimal(mileageText, 2000);
  const efficiency = mileageText.trim() ? typedEfficiency : recorded?.efficiencyKmPerUnit;
  const efficiencySource = mileageText.trim() ? savedEfficiency?.source ?? 'Manual override' : recorded ? 'Latest matching full-tank interval' : undefined;
  const manualRupees = parseTripDecimal(manualPrice, 10000);
  const unit = fuel === 'cng' ? 'kg' : 'L';
  const price = manualPrice.trim() ? (manualRupees ? { paise: Math.round(manualRupees * 100), source: 'Your entry',
    coverage: 'Manual planning assumption', observedAt: '' } : undefined) : referencePrice;
  const enteredRange = parseTripDecimal(rangeText, 20000);
  const availableFuel = parseTripDecimal(availableText, 1000, 3);
  const range = tripRange(enteredRange, availableFuel, efficiency);
  const estimate = route && fuel && efficiency ? tripEstimate(route.distanceMetres, fuel, efficiency, price?.paise) : undefined;
  const baselineEstimate = routes.base && fuel && efficiency ? tripEstimate(routes.base.distanceMetres, fuel, efficiency, price?.paise) : undefined;
  const metroId = points.origin ? indiaCities.find(city => points.origin!.label.toLowerCase().includes(city.name.toLowerCase())
    && distance(points.origin!, city) < 18)?.id : undefined;

  function stopStationSearch() {
    stationRequest.current?.abort();
    stationRequest.current = undefined;
    setSearching(false);
    setStationError('');
    setCorridor(undefined);
    setSelectedStation('');
  }
  function stopRouteRequest() {
    request.current?.abort();
    request.current = undefined;
    setRouting(false);
  }
  function editPoints(next: Points) {
    stopRouteRequest();
    stopStationSearch();
    setRouteError('');
    setNotice('');
    setRoutes({});
    setReferencePrice(undefined);
    setPoints(next);
  }

  async function calculate(next: Points = points, retainedBase?: TripRoute) {
    if (request.current) return;
    const waypoints = ordered(next);
    if (!waypoints) { setRouteError('Choose a starting point and a destination.'); return; }
    const controller = new AbortController();
    request.current = controller;
    setRouteError('');
    setRouting(true);
    const chosen = waypoints.filter(item => item.kind === 'fuel');
    try {
      let base = retainedBase;
      let alternatives: TripRoute[] | undefined;
      if (!base) {
        alternatives = await provider.route(waypoints.filter(item => item.kind !== 'fuel'), { signal: controller.signal, alternatives: !chosen.length && waypoints.length === 2 });
        base = alternatives[0];
      }
      if (controller.signal.aborted) return;
      if (!chosen.length) {
        stopStationSearch();
        setRoutes({ base, active: base, alternatives });
        return;
      }
      const reordered = { ...next, middle: insertFuelStops(base.geometry, next.middle.filter(item => item.kind === 'via'), chosen) };
      setPoints(reordered);
      setRoutes({ base });
      const [revised] = await provider.route(ordered(reordered)!, { signal: controller.signal });
      if (!controller.signal.aborted) {
        stopStationSearch();
        setRoutes({ base, active: revised });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setRouteError(text(cause, 'No road route was returned.'));
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setRouting(false);
      }
    }
  }

  function chooseRoute(item: TripRoute) {
    stopStationSearch();
    setRoutes(current => ({ ...current, base: item, active: item, saved: false }));
  }
  async function findStations(km: 3 | 5 = radius) {
    if (!route) return;
    stopStationSearch();
    const controller = new AbortController();
    stationRequest.current = controller;
    setRadius(km);
    setSearching(true);
    try {
      const result = await searchTripCorridor(db, route.geometry, km, profile, controller.signal);
      if (!controller.signal.aborted) setCorridor(result);
    } catch (cause) {
      if (!controller.signal.aborted) setStationError(text(cause, 'Route station search is unavailable.'));
    } finally {
      if (stationRequest.current === controller) { stationRequest.current = undefined; setSearching(false); }
    }
  }
  function addStation(item: CorridorStation) {
    if (!routes.base || routing || points.middle.length >= MAX_ROUTE_WAYPOINTS ||
        fuelStops.some(stop => stop.station?.id === item.station.id)) return;
    const station = item.station;
    const stop: TripWaypoint = { latitude: station.latitude, longitude: station.longitude, kind: 'fuel', label: stationDisplay(station).title,
      station: { id: station.id, brand: stationBrand(station), source: station.source,
        fuelTags: [...new Set(stationReferences(station).flatMap(ref => ref.fuelTags ?? []))], observedAt: item.retrievedAt } };
    const next = { ...points, middle: insertFuelStops(routes.base.geometry, points.middle.filter(point => point.kind === 'via'), [...fuelStops, stop]) };
    setPoints(next);
    setRoutes({ base: routes.base });
    void calculate(next, routes.base);
  }
  function removeStation(stop: TripWaypoint) {
    if (routing) return;
    const next = { ...points, middle: points.middle.filter(item => item !== stop) };
    stopStationSearch();
    setPoints(next);
    if (next.middle.some(item => item.kind === 'fuel')) {
      setRoutes({ base: routes.base });
      void calculate(next, routes.base);
    } else if (routes.base) {
      setRoutes({ base: routes.base, active: routes.base, saved: routes.saved });
      setRouteError('');
    } else editPoints(next);
  }
  async function refreshPrices() {
    if (priceLoading) return;
    setPriceLoading(true);
    setPriceNotice('');
    try {
      const result = await loadPrices(db);
      setPrices(result.prices);
      setPriceNotice(result.notice ?? 'City references are shown only for a matching metro origin and recent effective date.');
    } catch (cause) { setPriceNotice(text(cause, 'City reference unavailable. Enter your expected price.')); }
    finally { setPriceLoading(false); }
  }

  function chooseVehicle(value: string) {
    if (String(vehicleId) === value) return;
    setVehicleChoice(value);
    setPlanId(undefined);
    setSavedTrips([]);
    setFuelChoice(undefined);
    setMileageText('');
    setSavedEfficiency(undefined);
    setManualPrice('');
    setReferencePrice(undefined);
    setRangeText('');
    setAvailableText('');
    setNotice('');
  }
  function resetPlan() {
    editPoints(emptyPoints);
    setTitle('');
    setPlanId(undefined);
    setMileageText('');
    setSavedEfficiency(undefined);
    setManualPrice('');
    setRangeText('');
    setAvailableText('');
  }
  function applyPlan(plan: TripPlan) {
    const origin = plan.waypoints[0];
    const destination = plan.waypoints.at(-1);
    editPoints({ origin, destination, middle: plan.waypoints.slice(1, -1) });
    setTitle(plan.title);
    setPlanId(plan.id);
    setRoutes({ base: plan.baseRoute ?? undefined, active: plan.route ?? undefined, saved: true });
    const a = plan.assumptions;
    setFuelChoice(a.fuelType);
    setMileageText(numberText(a.efficiency));
    setSavedEfficiency(a.efficiency === undefined ? undefined : { value: a.efficiency, source: a.efficiencySource });
    setRangeText(numberText(a.rangeKm));
    setAvailableText(numberText(a.availableFuel));
    setManualPrice(a.priceSource === 'Your entry' && a.pricePaisePerUnit ? String(a.pricePaisePerUnit / 100) : '');
    if (a.pricePaisePerUnit && a.priceSource !== 'Your entry') setReferencePrice({ paise: a.pricePaisePerUnit,
      source: a.priceSource ?? 'Saved price', coverage: a.priceCoverage ?? 'Saved planning assumption', observedAt: a.priceObservedAt ?? '' });
    setShowSaved(false);
  }
  async function withSaved(action: (id: number) => Promise<void>) {
    if (!vehicleId || storageBusy.current) return;
    storageBusy.current = true;
    setSaving(true);
    setNotice('');
    try { await action(vehicleId); }
    catch (cause) { setNotice(text(cause, 'The trip operation failed.')); }
    finally { storageBusy.current = false; setSaving(false); }
  }
  function save() {
    const itinerary = ordered(points);
    if (!itinerary) { setNotice('Choose a start and destination before saving.'); return; }
    if (!title.trim()) { setNotice('Enter a name for this trip.'); return; }
    if ((mileageText.trim() && !typedEfficiency) || (manualPrice.trim() && !manualRupees) ||
        (rangeText.trim() && !enteredRange) || (availableText.trim() && !availableFuel)) {
      setNotice('Correct the fuel assumptions or leave the optional fields blank.');
      return;
    }
    void withSaved(async id => {
      const savedId = await saveTrip(db, { vehicleId: id, title: title.trim(), waypoints: itinerary,
        route: routes.active ?? null, baseRoute: routes.base ?? null,
        assumptions: { fuelType: fuel, efficiency, efficiencySource, pricePaisePerUnit: price?.paise, priceSource: price?.source,
          priceCoverage: price?.coverage, priceObservedAt: price?.observedAt || undefined, rangeKm: enteredRange, availableFuel,
        } }, planId);
      setPlanId(savedId);
      setNotice('Trip saved on this device.');
    });
  }
  function open(id: number, copy = false) {
    void withSaved(async owner => {
      const nextId = copy ? await duplicateTrip(db, owner, id) : id;
      const item = await getTrip(db, owner, nextId);
      if (!item) throw new Error('This trip is no longer available.');
      applyPlan(item);
    });
  }
  function remove(id: number) {
    void withSaved(async owner => {
      await deleteTrip(db, owner, id);
      if (planId === id) resetPlan();
      setSavedTrips(await listTrips(db, owner));
      setNotice('Trip deleted.');
    });
  }

  return { vehicle, vehicles, chooseVehicle, points, editPoints, orderedPoints: ordered(points), routes, route, routing, routeError,
    calculate, stopRouteRequest, chooseRoute, fuelStops, addStation, removeStation, radius, setRadius, corridor,
    findStations, searching, stationError, selectedStation, setSelectedStation, stopStationSearch,
    title, setTitle, planId, showSaved, setShowSaved, savedTrips, save, open, remove, saving, resetPlan, notice, setNotice,
    fuel, recorded, fuelChoice, setFuelChoice: (value: TripFuel) => {
      if (value === fuelChoice) return;
      setFuelChoice(value); setManualPrice(''); setReferencePrice(undefined); setMileageText(''); setSavedEfficiency(undefined); setAvailableText('');
    },
    unit, mileageText, efficiencySource, invalidMileage: !!mileageText.trim() && !typedEfficiency,
    setMileageText: (value: string) => { setMileageText(value); setSavedEfficiency(undefined); },
    manualPrice, setManualPrice, referencePrice, setReferencePrice, setManualRange: setRangeText,
    rangeText, availableText, setAvailableText, range, estimate, baselineEstimate, price, prices, metroId, refreshPrices, priceLoading, priceNotice };
}
