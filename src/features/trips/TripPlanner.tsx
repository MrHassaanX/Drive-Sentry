import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton, Card, ChoiceField, InlineMessage, Metric, PageHeading, Screen, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import AddressSearch from '../stations/AddressSearch';
import { stationBrand } from '../stations/brands';
import { stationDisplay } from '../stations/displayName';
import { resolveForegroundLocation } from '../stations/foregroundLocation';
import type { Point, Station } from '../stations/provider';
import { filterCorridorStations, routedDetourMetres } from './corridor';
import { metroTripPrice, outletTripPrice, parseTripDecimal } from './estimates';
import { googleMapsDirectionsUrl, MAX_ROUTE_WAYPOINTS, OPENSTREETMAP_ATTRIBUTION_URL, OPENSTREETMAP_FIX_MAP_URL } from './routing';
import type { TripWaypoint } from './repository';
import TripMap from './TripMap';
import { useTripPlanner } from './useTripPlanner';

const km = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' km';
const measure = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const metricDistance = (metres: number) => km(metres / 1000);
const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return (minutes >= 60 ? Math.floor(minutes / 60) + ' h ' : '') + minutes % 60 + ' min';
};
const emptyGeometry: Point[] = [];
type PlaceSlot = 'origin' | 'destination' | number;
const premiumOptions = [{ value: '', label: 'All grades' }, { value: 'premium', label: 'Premium evidence' }, { value: 'e0', label: 'Verified E0' }] as const;
const fuelOptions = [{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'cng', label: 'CNG' }] as const;

export default function TripPlanner() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  const { colors } = useAppTheme();
  const trip = useTripPlanner(vehicle);
  const [placeSlot, setPlaceSlot] = useState<PlaceSlot>();
  const [picker, setPicker] = useState<'search' | 'map'>();
  const [mapPoint, setMapPoint] = useState<Point>();
  const [gpsBusy, setGpsBusy] = useState(false);
  const gps = useRef<symbol>(undefined);
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [fuelFilter, setFuelFilter] = useState<'all' | 'vehicle'>('all');
  const [brand, setBrand] = useState('');
  const [premium, setPremium] = useState<'' | 'premium' | 'e0'>('');
  const [maxProximity, setMaxProximity] = useState<number>();
  const [visibleCount, setVisibleCount] = useState(12);
  const { points, route, routes } = trip;

  useEffect(() => () => { gps.current = undefined; }, []);
  const markers = useMemo(() => [points.origin, ...points.middle, points.destination].flatMap((point, index) => point ? [{
    latitude: point.latitude, longitude: point.longitude, label: point.label, id: String(index),
    symbol: point.kind === 'origin' ? 'A' : point.kind === 'destination' ? 'B' : point.kind === 'fuel' ? 'F' : String(index),
  }] : []), [points]);
  const brands = useMemo(() => [...new Set(trip.corridor?.candidates.map(item => stationBrand(item.station)).filter(Boolean) ?? [])].sort(), [trip.corridor]);
  const filtered = useMemo(() => filterCorridorStations(trip.corridor?.candidates ?? [], {
    fuel: fuelFilter === 'vehicle' ? trip.fuel : undefined, brand: brand || undefined, premium: premium || undefined,
    maxProximityKm: maxProximity,
  }), [trip.corridor, fuelFilter, trip.fuel, brand, premium, maxProximity]);
  const stationMarkers = useMemo(() => filtered.map(item => ({
    id: item.station.id, latitude: item.station.latitude, longitude: item.station.longitude,
    symbol: 'P', label: stationDisplay(item.station).title,
  })), [filtered]);
  const selected = filtered.find(item => item.station.id === trip.selectedStation);
  const reach = trip.range;
  const recommendations = reach && trip.fuel
    ? filterCorridorStations(filtered, { fuel: trip.fuel }).filter(item => item.alongKm + item.proximityKm <= reach &&
      !trip.fuelStops.some(stop => stop.station?.id === item.station.id))
      .sort((a, b) => b.alongKm - a.alongKm || a.proximityKm - b.proximityKm).slice(0, 3)
    : [];
  const metro = trip.fuel ? metroTripPrice(trip.prices, trip.metroId, trip.fuel) : undefined;

  function choosePlace(slot: PlaceSlot, mode: 'search' | 'map') {
    setPlaceSlot(slot);
    setMapPoint(undefined);
    setPicker(mode);
  }
  function setPlace(slot: PlaceSlot, point: Point & { label: string }) {
    const waypoint: TripWaypoint = { latitude: point.latitude, longitude: point.longitude, label: point.label,
      kind: typeof slot === 'number' ? 'via' : slot };
    if (typeof slot === 'number') {
      const middle = [...points.middle];
      middle[slot] = waypoint;
      trip.editPoints({ ...points, middle });
    } else trip.editPoints({ ...points, [slot]: waypoint });
    setPicker(undefined);
    setPlaceSlot(undefined);
  }
  async function gpsStart() {
    if (gps.current) return;
    const token = Symbol();
    gps.current = token;
    setGpsBusy(true);
    trip.setNotice('');
    try {
      const fix = await resolveForegroundLocation('gps');
      if (fix && gps.current === token) setPlace('origin', fix);
    } catch (cause) {
      if (gps.current === token) trip.setNotice(cause instanceof Error ? cause.message : 'Current location is unavailable.');
    } finally {
      if (gps.current === token) { gps.current = undefined; setGpsBusy(false); }
    }
  }
  function swap() {
    if (!points.origin || !points.destination) return;
    trip.editPoints({ origin: { ...points.destination, kind: 'origin' }, destination: { ...points.origin, kind: 'destination' },
      middle: [...points.middle].reverse() });
  }
  async function openMaps() {
    if (!trip.orderedPoints) return;
    try { await Linking.openURL(googleMapsDirectionsUrl(trip.orderedPoints)); }
    catch (cause) { trip.setNotice(cause instanceof Error ? cause.message : 'Google Maps could not be opened.'); }
  }
  function navigateBack() {
    if (trip.showSaved) { trip.setShowSaved(false); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  function placeEditor(slot: PlaceSlot, heading: string, point?: TripWaypoint) {
    return <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{heading}</Text>
      {point && <Text style={{ color: colors.muted }}>{point.label}</Text>}
      <View style={styles.row}>
        <AppButton label={'Search ' + heading.toLowerCase()} variant="secondary" disabled={gpsBusy} onPress={() => choosePlace(slot, 'search')} />
        {Platform.OS !== 'web' && <AppButton label={'Pick ' + heading.toLowerCase() + ' on map'} variant="ghost" disabled={gpsBusy}
          onPress={() => choosePlace(slot, 'map')} />}
      </View>
    </View>;
  }
  function stationPrice(station: Station) {
    return trip.fuel ? outletTripPrice(station, trip.fuel) : undefined;
  }
  function stationRate(station: Station) {
    const price = stationPrice(station);
    if (!price) return null;
    return <Text style={{ color: colors.muted }}>{formatRupees(price.paise)}/L · {price.source} · {price.observedAt.slice(0, 10)}</Text>;
  }
  const canAdd = points.middle.length < MAX_ROUTE_WAYPOINTS;
  const activeDetour = routes.active && routes.base && trip.fuelStops.length
    ? routedDetourMetres(routes.base.distanceMetres, routes.active.distanceMetres) : undefined;

  return <Screen>
    <AppButton label="Back" variant="ghost" onPress={navigateBack} />
    <PageHeading eyebrow="Fuel & travel" title={trip.showSaved ? 'Saved trips' : 'Smart Trip Planner'}
      subtitle={trip.showSaved ? 'Plans saved on this device open offline.' : 'Plan an Indian road trip, estimate fuel use and choose refuelling stops.'} />
    {trip.notice && <InlineMessage>{trip.notice}</InlineMessage>}
    <Card>
      <ChoiceField label="Vehicle" value={String(trip.vehicle?.id ?? '')} options={trip.vehicles.map(item => ({ value: String(item.id), label: item.name }))}
        onChange={value => { if (!trip.saving && !trip.routing) trip.chooseVehicle(value); }} />
      {!trip.vehicles.length && <AppButton label="Add a vehicle" variant="secondary" onPress={() => router.push('/vehicles/new')} />}
      <AppButton label={trip.showSaved ? 'Back to planner' : 'Saved trips'} variant="secondary" disabled={!trip.vehicle || trip.saving}
        onPress={() => { trip.setNotice(''); trip.setShowSaved(!trip.showSaved); }} />
    </Card>
    {trip.showSaved ? <>
      {!trip.savedTrips.length && <InlineMessage>No trip plans for this vehicle yet.</InlineMessage>}
      {trip.savedTrips.map(item => <Card key={item.id}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={{ color: colors.muted }}>{item.distanceMetres == null ? 'Itinerary only' : metricDistance(item.distanceMetres) + ' · Saved route'} · {item.updatedAt.slice(0, 10)}</Text>
        <View style={styles.row}>
          <AppButton label="Open trip" accessibilityLabel={'Open ' + item.title} disabled={trip.saving} onPress={() => trip.open(item.id)} />
          <AppButton label="Duplicate" accessibilityLabel={'Duplicate ' + item.title} disabled={trip.saving} variant="secondary" onPress={() => trip.open(item.id, true)} />
          <AppButton label="Delete" accessibilityLabel={'Delete ' + item.title} disabled={trip.saving} variant="danger" onPress={() =>
            Alert.alert('Delete saved trip?', item.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => trip.remove(item.id) }])} />
        </View>
      </Card>)}
    </> : <>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Itinerary</Text>
        {placeEditor('origin', 'Starting point', points.origin)}
        <AppButton label="Use current location for start" variant="secondary" loading={gpsBusy} onPress={() => void gpsStart()} />
        {placeEditor('destination', 'Destination', points.destination)}
        <AppButton label="Swap start and destination" variant="ghost" disabled={!points.origin || !points.destination || gpsBusy} onPress={swap} />
        {points.middle.map((point, index) => point.kind === 'via' ? <View key={index} style={styles.field}>
          {placeEditor(index, 'Stop ' + (index + 1), point)}
          <AppButton label={'Remove stop ' + (index + 1)} variant="ghost"
            onPress={() => trip.editPoints({ ...points, middle: points.middle.filter((_, position) => position !== index) })} />
        </View> : <View key={index} style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Refuelling stop · {point.label}</Text>
          <AppButton label="Remove refuelling stop" variant="ghost" disabled={trip.routing} onPress={() => trip.removeStation(point)} />
        </View>)}
        <View style={styles.row}>
          <AppButton label="Add intermediate stop" variant="secondary" disabled={!canAdd || gpsBusy}
            onPress={() => choosePlace(points.middle.length, 'search')} />
          {Platform.OS !== 'web' && <AppButton label="Add stop from map" variant="ghost" disabled={!canAdd || gpsBusy}
            onPress={() => choosePlace(points.middle.length, 'map')} />}
        </View>
        <Text style={{ color: colors.muted }}>Route requests send selected coordinates to the routing provider. The public FOSSGIS service may log the requested points.</Text>
        <AppButton label={route ? 'Refresh road route' : 'Calculate road route'} loading={trip.routing} disabled={!trip.orderedPoints || gpsBusy}
          onPress={() => void trip.calculate()} />
        {trip.routing && <AppButton label="Cancel routing" variant="ghost" onPress={trip.stopRouteRequest} />}
        {!!trip.routeError && <InlineMessage tone="error">{trip.routeError}</InlineMessage>}
        <AppButton label="Open in Google Maps" variant="secondary" disabled={!trip.orderedPoints} onPress={() => void openMaps()} />
        <Text style={{ color: colors.muted }}>Google Maps calculates its own driving route. The mobile link supports up to three intermediate stops.</Text>
      </Card>
      {route && <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{routes.saved ? 'Saved road route' :
          trip.fuelStops.length && !routes.active ? 'Original road route' : 'Road route'}</Text>
        <Text style={{ color: colors.muted }}>{points.origin?.label} → {points.destination?.label}</Text>
        <View style={styles.metrics}>
          <Metric label="Road distance" value={metricDistance(route.distanceMetres)} />
          <Metric label="Estimated drive time" value={duration(route.durationSeconds)} />
        </View>
        {trip.fuelStops.length > 0 && routes.base && <Text style={{ color: colors.muted }}>
          Original {metricDistance(routes.base.distanceMetres)} · {duration(routes.base.durationSeconds)}.
          {activeDetour === undefined ? ' Revised road distance pending. Station proximity remains a straight-line measurement.' :
            activeDetour < 0 ? ' Revised route is ' + metricDistance(-activeDetour) + ' shorter.' :
              ' Routed detour +' + metricDistance(activeDetour) + '.'}
        </Text>}
        <Text style={{ color: colors.muted }}>{route.provider} · {route.attribution} · Calculated {route.calculatedAt.slice(0, 16).replace('T', ' ')} UTC. Travel time is a routing estimate.</Text>
        <View style={styles.row}>
          <AppButton label="OpenStreetMap credits" variant="ghost" onPress={() => void Linking.openURL(OPENSTREETMAP_ATTRIBUTION_URL).catch(() => {})} />
          <AppButton label="Fix the map" variant="ghost" onPress={() => void Linking.openURL(OPENSTREETMAP_FIX_MAP_URL).catch(() => {})} />
        </View>
        {routes.alternatives && routes.alternatives.length > 1 && !trip.fuelStops.length && <ChoiceField label="Route alternatives" value={route.id}
          options={routes.alternatives.map((item, index) => ({ value: item.id, label: 'Route ' + (index + 1) + ' · ' + metricDistance(item.distanceMetres) + ' · ' + duration(item.durationSeconds) }))}
          onChange={id => { const item = routes.alternatives?.find(choice => choice.id === id); if (item) trip.chooseRoute(item); }} />}
        <ChoiceField label="Route view" value={mode} options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List' }]} onChange={setMode} />
        {mode === 'map' ? <TripMap geometry={route.geometry} waypoints={markers} stations={stationMarkers}
          selectedId={trip.selectedStation} onSelect={trip.setSelectedStation} /> :
          trip.orderedPoints?.map((item, index) => <Text key={index} style={{ color: colors.text }}>{index + 1}. {item.label}{item.kind === 'fuel' ? ' · Refuel' : ''}</Text>)}
        {mode === 'map' && selected && <Card>
          <Text style={[styles.label, { color: colors.text }]}>{stationDisplay(selected.station).title}</Text>
          <Text style={{ color: colors.muted }}>{km(selected.proximityKm)} from route in a straight line · {selected.station.source}</Text>
          {stationRate(selected.station)}
          <AppButton label="Add selected station and recalculate" disabled={!canAdd || trip.routing || trip.fuelStops.some(item => item.station?.id === selected.station.id)}
            onPress={() => trip.addStation(selected)} />
        </Card>}
      </Card>}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Fuel and cost assumptions</Text>
        {trip.vehicle?.fuel_type === 'hybrid' && <ChoiceField label="Planning fuel for this hybrid" value={trip.fuelChoice ?? ''}
          options={[...fuelOptions]} onChange={value => { if (value) trip.setFuelChoice(value); }} />}
        {trip.vehicle?.fuel_type === 'electric' ? <InlineMessage>Fuel-based estimates are unavailable for an electric vehicle.</InlineMessage> :
          !trip.fuel ? <InlineMessage>Select a compatible vehicle and planning fuel to estimate consumption.</InlineMessage> : <>
          <TextField label={'Mileage override (km/' + trip.unit + ')'} value={trip.mileageText} onChangeText={trip.setMileageText}
            keyboardType="decimal-pad" maxLength={10} error={trip.invalidMileage ? 'Enter a positive mileage.' : undefined} />
          <Text style={{ color: colors.muted }}>{trip.recorded ?
            measure(trip.recorded.efficiencyKmPerUnit) + ' km/' + trip.unit + ' · Latest matching full-tank interval ending ' + trip.recorded.endDate.slice(0, 10) :
            'No matching full-tank interval. Enter your own expected mileage.'}</Text>
          {!!trip.mileageText.trim() && !!trip.efficiencySource && <Text style={{ color: colors.muted }}>Mileage assumption · {trip.efficiencySource}</Text>}
          <TextField label={'Manual price (₹/' + trip.unit + ')'} value={trip.manualPrice} onChangeText={trip.setManualPrice}
            keyboardType="decimal-pad" maxLength={10} error={trip.manualPrice && !parseTripDecimal(trip.manualPrice, 10000) ? 'Enter a positive price with up to two decimals.' : undefined} />
          {metro && <AppButton label={'Use ' + metro.coverage + ' · ' + formatRupees(metro.paise) + '/L'}
            variant="secondary" onPress={() => { trip.setManualPrice(''); trip.setReferencePrice(metro); }} />}
          {!metro && <Text style={{ color: colors.muted }}>No recent city reference for this origin and fuel. Enter a price or choose a recent outlet observation.</Text>}
          {trip.fuel !== 'cng' && <AppButton label="Check city references" variant="ghost" loading={trip.priceLoading} onPress={() => void trip.refreshPrices()} />}
          {!!trip.priceNotice && <Text style={{ color: colors.muted }}>{trip.priceNotice}</Text>}
          {trip.price && <Text style={{ color: colors.muted }}>{formatRupees(trip.price.paise)}/{trip.unit} · {trip.price.coverage} · {trip.price.source}
            {trip.price.observedAt ? ' · ' + trip.price.observedAt.slice(0, 10) : ''}</Text>}
          {trip.referencePrice && <AppButton label="Clear selected price" variant="ghost" onPress={() => trip.setReferencePrice(undefined)} />}
          {trip.estimate && <View style={styles.metrics}>
            <Metric label="Estimated fuel" value={measure(trip.estimate.consumed)} suffix={trip.estimate.unit} />
            <Metric label="Estimated fuel spend" value={trip.estimate.totalPaise === undefined ? 'Price needed' : formatRupees(trip.estimate.totalPaise)} />
          </View>}
          {trip.fuelStops.length > 0 && routes.active && trip.baselineEstimate && <Text style={{ color: colors.muted }}>
            Original estimate {measure(trip.baselineEstimate.consumed)} {trip.baselineEstimate.unit}
            {trip.baselineEstimate.totalPaise !== undefined ? ' · ' + formatRupees(trip.baselineEstimate.totalPaise) : ''}.
          </Text>}
          <Text style={{ color: colors.muted }}>Fuel = routed km ÷ mileage. Spend = estimated fuel × selected price. City references describe the city, while outlet observations describe that outlet on the listed date.</Text>
          <TextField label="Remaining range (km, optional)" value={trip.rangeText} onChangeText={trip.setManualRange} keyboardType="decimal-pad" maxLength={10} />
          <TextField label={'Available fuel (' + trip.unit + ', optional)'} value={trip.availableText} onChangeText={trip.setAvailableText}
            keyboardType="decimal-pad" maxLength={10} />
          <Text style={{ color: colors.muted }}>Suggestions use the range you entered or the available fuel × mileage. DriveSentry does not measure the tank.</Text>
        </>}
      </Card>
      {route && <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Fuel stations along the route</Text>
        <ChoiceField label="Search corridor on each side" value={String(trip.radius)}
          options={[{ value: '3', label: '3 km' }, { value: '5', label: '5 km' }]} onChange={value => {
            trip.stopStationSearch(); trip.setRadius(value === '5' ? 5 : 3);
          }} />
        <AppButton label={trip.corridor ? 'Refresh route stations' : 'Find route stations'} loading={trip.searching}
          onPress={() => { setBrand(''); setVisibleCount(12); void trip.findStations(); }} />
        {trip.searching && <AppButton label="Cancel station search" variant="ghost" onPress={trip.stopStationSearch} />}
        {!!trip.stationError && <InlineMessage tone="error">{trip.stationError}</InlineMessage>}
        {trip.corridor && <>
          <Text style={{ color: colors.muted }}>{trip.corridor.sources.join(' · ') || 'Source unavailable'}{trip.corridor.partial ? ' · Partial coverage' : ''}</Text>
          {trip.corridor.messages.map(message => <Text key={message} style={{ color: colors.muted }}>{message}</Text>)}
          <ChoiceField label="Station fuel evidence" value={fuelFilter} options={[{ value: 'all', label: 'All outlets' },
            ...(trip.fuel ? [{ value: 'vehicle' as const, label: 'Evidence for ' + trip.fuel }] : [])]} onChange={setFuelFilter} />
          <ChoiceField label="Brand" value={brand} options={[{ value: '', label: 'All brands' }, ...brands.map(value => ({ value, label: value }))]} onChange={setBrand} />
          <ChoiceField label="Fuel grade evidence" value={premium} options={[...premiumOptions]} onChange={setPremium} />
          <ChoiceField label="Maximum straight-line proximity" value={String(maxProximity ?? '')} options={[{ value: '', label: 'Entire corridor' },
            { value: '1', label: '1 km' }, { value: '2', label: '2 km' }]} onChange={value => setMaxProximity(value ? Number(value) : undefined)} />
          <Text style={{ color: colors.muted }}>{filtered.length} matching stations. Proximity is measured off the mapped road. Actual driving detour requires rerouting via the outlet.</Text>
          {!!recommendations.length && <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Suggested stops within your entered range</Text>
            <Text style={{ color: colors.muted }}>Check the actual routed detour and confirm fuel availability before leaving.</Text>
            {recommendations.map(item => <AppButton key={item.station.id}
              label={'Add ' + stationDisplay(item.station).title + ' · around ' + km(item.alongKm)} variant="secondary" disabled={!canAdd || trip.routing}
              onPress={() => trip.addStation(item)} />)}
          </View>}
          {!filtered.length && <InlineMessage>No mapped stations match the current corridor and filters.</InlineMessage>}
          {filtered.slice(0, visibleCount).map(item => {
            const station = item.station;
            const price = stationPrice(station);
            return <View key={station.id} style={[styles.station, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>{stationDisplay(station).title}</Text>
              <Text style={{ color: colors.muted }}>{km(item.alongKm)} along mapped route · {km(item.proximityKm)} away in a straight line</Text>
              <Text style={{ color: colors.muted }}>{station.source}{item.retrievedAt ? ' · Retrieved ' + item.retrievedAt.slice(0, 10) : ''}</Text>
              {stationRate(station)}
              <View style={styles.row}>
                {mode === 'map' && <AppButton label="Select marker" accessibilityLabel={'Select marker for ' + stationDisplay(station).title} variant="ghost"
                  onPress={() => trip.setSelectedStation(station.id)} />}
                <AppButton label="Add refuelling stop" accessibilityLabel={'Add refuelling stop at ' + stationDisplay(station).title} variant="secondary"
                  disabled={!canAdd || trip.routing || trip.fuelStops.some(stop => stop.station?.id === station.id)} onPress={() => trip.addStation(item)} />
                {price && <AppButton label="Use observed price" variant="ghost" onPress={() => { trip.setManualPrice(''); trip.setReferencePrice(price); }} />}
              </View>
            </View>;
          })}
          {filtered.length > visibleCount && <AppButton label="Show more stations" variant="secondary" onPress={() => setVisibleCount(value => value + 12)} />}
        </>}
      </Card>}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Save this trip</Text>
        <TextField label="Trip name" value={trip.title} onChangeText={trip.setTitle} maxLength={100} />
        <AppButton label={trip.planId ? 'Save changes' : 'Save trip'} disabled={!trip.vehicle || trip.routing} loading={trip.saving} onPress={trip.save} />
        <Text style={{ color: colors.muted }}>Edit the name and save changes to rename a trip. Saved calculations are planning estimates.</Text>
        <AppButton label="Start a new trip" variant="ghost" disabled={trip.saving} onPress={trip.resetPlan} />
      </Card>
    </>}
    {picker === 'search' && placeSlot !== undefined && <AddressSearch onClose={() => setPicker(undefined)}
      onSelect={item => setPlace(placeSlot, item)} />}
    {picker === 'map' && placeSlot !== undefined && <Modal animationType="fade" onRequestClose={() => setPicker(undefined)}>
      <Screen>
        <AppButton label="Close map picker" variant="ghost" onPress={() => setPicker(undefined)} />
        <PageHeading title="Choose a point on the map" subtitle="Pan or zoom, then tap the road or place you want to use." />
        <TripMap geometry={route?.geometry ?? emptyGeometry} waypoints={markers} onPick={setMapPoint} />
        <AppButton label="Use selected point" disabled={!mapPoint} onPress={() => {
          if (mapPoint) setPlace(placeSlot, { ...mapPoint, label: 'Map point ' + mapPoint.latitude.toFixed(4) + ', ' + mapPoint.longitude.toFixed(4) });
        }} />
        {mapPoint && <Text style={{ color: colors.muted }}>{mapPoint.latitude.toFixed(5)}, {mapPoint.longitude.toFixed(5)}</Text>}
      </Screen>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 8 },
  field: { gap: 6 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 15, fontWeight: '700' },
  station: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
});
