import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { AppButton, InlineMessage } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { premiumFilters, type PremiumFilter } from '../premium/catalog';
import { communityEvidence, evidenceForStation, gradeName, matchesPremium, verifiedE0 } from '../premium/evidence';
import OutletPriceCard from '../fuelPrices/OutletPriceCard';
import { stationBrand } from './brands';
import { stationDisplay } from './displayName';
import { stationSupportsFuel } from './fuelAvailability';
import { stationReferences } from './identity';
import type { Point, Radius } from './provider';
import AddressSearch from './AddressSearch';
import StationMap from './StationMap';
import { useStationSearch, type StationSearchSource } from './useStationSearch';

const radii: Radius[] = [3, 5, 10];
const premiumRadii: Radius[] = [...radii, 25, 50];
const generalFilters = [...premiumFilters.filter(option => option.id === 'stations'),
  ...premiumFilters.filter(option => option.id !== 'stations')];
const fuelChoices = ['All fuels', 'Petrol', 'Diesel'] as const;
const hasStationMap = Platform.OS === 'ios' || (Platform.OS === 'android' && (
  isRunningInExpoGo() ||
  Constants.expoConfig?.extra?.standaloneMapEnabled === true
));
const reveal = FadeInDown.duration(180).reduceMotion(ReduceMotion.System);
const dismiss = FadeOutDown.duration(140).reduceMotion(ReduceMotion.System);

async function directions(point: Point) {
  const destination = point.latitude + ',' + point.longitude;
  const web = 'https://www.google.com/maps/dir/?api=1&destination=' + destination;
  try {
    await Linking.openURL(Platform.OS === 'android' ? 'google.navigation:q=' + destination : web);
  } catch {
    try {
      await Linking.openURL(web);
    } catch {
      Alert.alert('Directions unavailable', 'Station coordinates: ' + destination);
    }
  }
}

export default function StationFinder({ premium = false }: { premium?: boolean }) {
  const { colors } = useAppTheme();
  const { origin, deviceLocation, radius, result, message, busy, run } = useStationSearch();
  const [mode, setMode] = useState<'Map' | 'List'>(hasStationMap ? 'Map' : 'List');
  const [showSearch, setShowSearch] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [fuel, setFuel] = useState<typeof fuelChoices[number]>('All fuels');
  const [brand, setBrand] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [showDetails, setShowDetails] = useState(false);
  const [filter, setFilter] = useState<PremiumFilter>(premium ? 'premium' : 'stations');
  const evidence = useMemo(() => new Map(result ? result.stations.map(station => [
    station.id, evidenceForStation(station, communityEvidence(station, result.fetched)),
  ] as const) : []), [result]);
  const brands = useMemo(() => [...new Set(result?.stations.map(stationBrand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)), [result]);
  const grade = premium || filter !== 'stations';
  const stations = useMemo(() => result?.stations.filter(station =>
    (!brand || stationBrand(station) === brand) &&
    (fuel === 'All fuels' || stationSupportsFuel(station, fuel)) &&
    (!grade || matchesPremium(filter, evidence.get(station.id) ?? []))) ?? [],
  [brand, evidence, filter, fuel, grade, result]);
  const resultNoun = grade && filter !== 'stations'
    ? (stations.length === 1 ? 'match' : 'matches')
    : (stations.length === 1 ? 'station' : 'stations');
  const selected = selectedId ? stations.find(station => station.id === selectedId ||
    station.references?.some(reference => reference.id === selectedId)) : undefined;
  const selectedDisplay = selected && stationDisplay(selected);
  const selectedEvidence = selected ? evidence.get(selected.id) ?? [] : [];
  const unavailable = filter === 'e0'
    ? 'No verified E0 outlets in these results.'
    : grade && filter !== 'stations' ? 'No matching premium-grade evidence in these results.' : 'No stations match these filters.';
  const muted = { color: colors.muted };
  const text = { color: colors.text };
  const accent = { color: colors.accent };
  const outline = { backgroundColor: colors.surface, borderColor: colors.border };

  function changeSearch(source: StationSearchSource, km = radius, refresh = false) {
    if (!refresh) setSelectedId(undefined);
    if (source !== 'reuse') {
      setShowSearch(false);
      setBrand('');
    }
    void run(source, km, refresh);
  }

  function selectStation(id: string) {
    setSelectedId(id);
    setShowSearch(false);
    setShowDetails(false);
    if (hasStationMap) setMode('Map');
  }

  function chip(label: string, onPress: () => void, options: { selected?: boolean; disabled?: boolean } = {}) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={options}
        disabled={options.disabled} onPress={onPress} style={[styles.chip, outline,
          options.selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          options.disabled && styles.disabled]}>
        <Text style={[styles.chipText, options.selected ? accent : text]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Fuel" onPress={() => router.back()} style={styles.back}>
            <Text style={[styles.link, accent]}>‹ Fuel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, text]}>{premium ? 'Premium Fuel Explorer' : 'Fuel Map'}</Text>
        </View>
        <View style={styles.toolbar}>
          <View style={styles.location}>
            <Text style={[styles.locationTitle, text]} numberOfLines={2}>{origin?.label ?? (busy ? 'Finding your location…' : 'Location unavailable')}</Text>
            <Text style={[styles.small, muted]} numberOfLines={1}>
              {radius} km{brand ? ' · ' + brand : ''}{grade && filter !== 'stations' ? ' · ' + premiumFilters.find(option => option.id === filter)?.label : ''}
            </Text>
          </View>
          {chip(showSearch ? 'Done' : 'Search & filters', () => {
            if (!showSearch) setShowDetails(false);
            setShowSearch(!showSearch);
          }, { selected: showSearch })}
        </View>
        {(showSearch || (!origin && !busy)) && <View style={styles.options}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {chip('My Location', () => changeSearch('gps'), { disabled: busy })}
            {chip('Search city or address', () => setShowAddress(true), { disabled: busy })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(premium ? premiumRadii : radii).map(km => <View key={km}>
              {chip(km + ' km', () => changeSearch('reuse', km), { selected: radius === km, disabled: !origin || busy })}
            </View>)}
            {chip('Refresh', () => changeSearch('reuse', radius, true), { disabled: !origin || busy })}
          </ScrollView>
          {brands.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {chip('All brands', () => setBrand(''), { selected: !brand })}
            {brands.map(name => <View key={name}>
              {chip(name, () => { setBrand(name); setSelectedId(undefined); }, { selected: brand === name })}
            </View>)}
          </ScrollView>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(premium ? premiumFilters : generalFilters).map(option => <View key={option.id}>
                {chip(option.label, () => { setFilter(option.id); setSelectedId(undefined); }, { selected: option.id === filter })}
            </View>)}
          </ScrollView>
          {!premium && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {fuelChoices.map(choice => <View key={choice}>
              {chip(choice, () => { setFuel(choice); setSelectedId(undefined); }, { selected: fuel === choice })}
            </View>)}
          </ScrollView>}
          <Text style={[styles.small, muted]}>Fuel filters use mapped tags. Search coordinates are rounded.</Text>
        </View>}
        {!hasStationMap && Platform.OS === 'android' && (
          <Text style={[styles.small, muted]}>This build uses the station list. The basemap requires Maps SDK configuration.</Text>
        )}
      </View>

      <View style={styles.content}>
        {!origin ? (
          <View style={styles.locationEmpty}>
            {busy && <ActivityIndicator color={colors.accent} />}
            <Text style={muted}>{busy ? 'Waiting for a device location fix' : 'Use My Location or search for a city or address.'}</Text>
          </View>
        ) : mode === 'Map' ? (
          <StationMap center={origin} deviceLocation={deviceLocation}
            radius={radius} stations={stations} selected={selected} onSelect={selectStation}
            onLocate={() => changeSearch('gps')} />
        ) : (
          <FlatList
            data={stations}
            keyExtractor={station => station.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={muted}>
                {busy ? 'Searching…' : result ? unavailable : 'Choose a location to search for stations.'}
              </Text>
            }
            renderItem={({ item }) => {
              const display = stationDisplay(item);
              const description = !display.exact && display.secondary ? display.title + ', ' + display.secondary : display.title;
              return <View style={[styles.listItem, outline, item.id === selected?.id && { borderColor: colors.accent }]}>
                <Pressable accessibilityRole="button"
                  accessibilityState={{ selected: item.id === selected?.id }}
                  accessibilityLabel={description + (hasStationMap ? ', show on map' : ', view details')}
                  onPress={() => selectStation(item.id)}>
                  <Text style={[styles.locationTitle, text]}>{display.title}</Text>
                  <Text style={accent}>{item.km.toFixed(2)} km · straight line</Text>
                  {!!display.secondary && <Text style={muted}>{display.secondary}</Text>}
                  {!display.exact && <Text style={[styles.small, muted]}>Exact outlet name not listed</Text>}
                  {grade && <Text style={muted}>{evidence.get(item.id)?.length
                    ? evidence.get(item.id)?.map(entry => gradeName(entry.grade)).join(' · ')
                    : 'Premium availability not confirmed'}</Text>}
                </Pressable>
                {!hasStationMap && <AppButton label="Get Directions" variant="ghost" onPress={() => void directions(item)} />}
              </View>;
            }}
          />
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.row}>
          <View style={styles.location}>
            <Text accessibilityLiveRegion="polite" style={[styles.locationTitle, text]}>
              {busy ? 'Searching…' : result ? stations.length + ' ' + resultNoun + ' within ' + radius + ' km' : hasStationMap ? 'Fuel station map' : 'Fuel station list'}
            </Text>
            {result && <Text style={muted}>{result.status}</Text>}
          </View>
          {hasStationMap && chip('Map', () => setMode('Map'), { selected: mode === 'Map' })}
          {hasStationMap && chip('List', () => setMode('List'), { selected: mode === 'List' })}
        </View>
        {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}
        {mode === 'Map' && result && !stations.length && (
          <Text style={[styles.small, muted]}>{unavailable} Change the filters or try a wider radius.</Text>
        )}
        {result && (
          <Text style={[styles.small, muted]}>
            {result.source} · Retrieved {new Date(result.fetched).toLocaleString()}{result.limited ? ' · Result limit reached' : ''}
          </Text>
        )}
        {selected && selectedDisplay && !showSearch && (mode === 'Map' || !hasStationMap) && (
          <Animated.View entering={reveal} exiting={dismiss} style={[styles.details, outline]}>
            <View style={styles.row}>
              <View style={styles.location}>
                <Text style={[styles.detailTitle, text]} numberOfLines={2}>{selectedDisplay.title}</Text>
                <Text style={[styles.small, accent]}>{selected.km.toFixed(2)} km · straight line
                  {stationBrand(selected) ? ' · ' + stationBrand(selected) : ''}</Text>
                {!!selectedDisplay.secondary && <Text style={[styles.small, muted]} numberOfLines={2}>{selectedDisplay.secondary}</Text>}
                {!selectedDisplay.exact && <Text style={[styles.small, muted]}>Exact outlet name not listed</Text>}
              </View>
              {chip('Close', () => setSelectedId(undefined))}
            </View>
            <OutletPriceCard key={selected.id} station={selected} onCityPrices={() => router.push('/fuel/prices')} />
            {showDetails && <ScrollView style={styles.metadata} nestedScrollEnabled persistentScrollbar>
              {grade && !selectedEvidence.length && <Text style={muted}>Premium availability not confirmed · Ethanol content unknown</Text>}
              {selectedEvidence.map(entry => (
                <View key={entry.grade + '/' + entry.source.sourceRecordId + '/' + entry.availability} style={styles.evidence}>
                  <Text style={[styles.locationTitle, text]}>{gradeName(entry.grade)}</Text>
                  <Text style={muted}>{entry.availability === 'community' ? 'Community reported — unverified' : 'Officially listed'}</Text>
                  <Text style={muted}>{verifiedE0(entry) ? 'Verified E0 · ' + entry.composition?.scope + ' evidence' : 'Ethanol content unknown'}</Text>
                  <Text style={[styles.small, muted]}>Verified date {entry.source.verifiedOn ?? 'unavailable'}</Text>
                  <Text accessibilityRole="link" style={[styles.small, accent]}
                    onPress={() => void Linking.openURL(entry.source.url).catch(() => {})}>{entry.source.publisher}</Text>
                  {entry.composition && verifiedE0(entry) && (
                    <Text accessibilityRole="link" style={[styles.small, accent]}
                      onPress={() => void Linking.openURL(entry.composition!.url).catch(() => {})}>
                      Composition evidence · {entry.composition.verifiedOn}
                    </Text>
                  )}
                </View>
              ))}
              {!!selected.hours && <Text style={text}>Mapped hours · {selected.hours}</Text>}
              {!!selected.fuels && <Text style={muted}>Mapped fuel tags · {selected.fuels}. Confirm stock with the outlet.</Text>}
              {stationReferences(selected).map(reference => (
                <Text key={reference.id} style={[styles.small, reference.osmRef ? accent : muted]}
                  accessibilityRole={reference.osmRef ? 'link' : undefined}
                  onPress={reference.osmRef ? () => void Linking.openURL('https://www.openstreetmap.org/' + reference.osmRef).catch(() => {}) : undefined}>
                  {reference.source}{reference.osmRef ? ' · OpenStreetMap ' + reference.osmRef : ''}
                </Text>
              ))}
            </ScrollView>}
            <View style={styles.actions}>
              {chip(showDetails ? 'Less detail' : 'Station details', () => setShowDetails(!showDetails), { selected: showDetails })}
              <View style={styles.location}><AppButton label="Get Directions" variant="secondary" onPress={() => void directions(selected)} /></View>
            </View>
          </Animated.View>
        )}
        <View style={styles.row}>
          {grade && <Text accessibilityRole="link" style={[styles.small, accent]}
            onPress={() => router.push('/fuel/grades')}>Fuel-grade guide</Text>}
          <Text accessibilityRole="link" style={[styles.small, accent]}
            onPress={() => void Linking.openURL('https://www.geoapify.com/').catch(() => {})}>Powered by Geoapify</Text>
          <Text accessibilityRole="link" style={[styles.small, accent]}
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>© OpenStreetMap contributors</Text>
        </View>
      </View>
      {showAddress && <AddressSearch onClose={() => setShowAddress(false)} onSelect={place => {
        setShowAddress(false);
        changeSearch(place);
      }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12 },
  header: { gap: 6, paddingBottom: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { justifyContent: 'center', minHeight: 44, paddingRight: 8 },
  link: { fontSize: 16, fontWeight: '700' },
  title: { flex: 1, fontSize: 23, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  location: { flex: 1, minWidth: 0 },
  locationTitle: { fontSize: 15, fontWeight: '700' },
  options: { gap: 5 },
  filterRow: { flexDirection: 'row', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, borderWidth: 1 },
  chipText: { fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
  content: { flex: 1, minHeight: 120 },
  locationEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  list: { gap: 8, paddingVertical: 8 },
  listItem: { borderRadius: 12, borderWidth: 1, gap: 5, padding: 12 },
  footer: { gap: 4, paddingTop: 6, paddingBottom: 6 },
  small: { fontSize: 12, lineHeight: 16 },
  details: { borderRadius: 16, borderWidth: 1, padding: 10, gap: 8 },
  detailTitle: { fontSize: 16, fontWeight: '800' },
  metadata: { maxHeight: 128 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evidence: { gap: 2, paddingTop: 8 },
});
