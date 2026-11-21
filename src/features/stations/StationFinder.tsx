import { useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, InlineMessage } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { premiumFilters, type PremiumFilter } from '../premium/catalog';
import { communityEvidence, evidenceForStation, gradeName, matchesPremium, verifiedE0 } from '../premium/evidence';
import { mysuru, type Point, type Radius } from './provider';
import StationMap from './StationMap';
import { useStationSearch, type StationSearchSource } from './useStationSearch';

const radii: Radius[] = [3, 5, 10];
const premiumRadii: Radius[] = [...radii, 25, 50];
const hasStationMap = Platform.OS === 'ios' || (Platform.OS === 'android' && (
  isRunningInExpoGo() ||
  Constants.expoConfig?.extra?.standaloneMapEnabled === true
));

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
  const { permission, origin, deviceLocation, radius, result, message, busy, run } = useStationSearch();
  const [mode, setMode] = useState<'Map' | 'List'>(hasStationMap ? 'Map' : 'List');
  const [showSearch, setShowSearch] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<PremiumFilter>('premium');
  const evidence = new Map(result && premium ? result.stations.map(station => [
    station.id, evidenceForStation(station, communityEvidence(station, result.fetched)),
  ] as const) : []);
  const stations = result?.stations.filter(station => !premium || matchesPremium(filter, evidence.get(station.id) ?? [])) ?? [];
  const resultNoun = premium && filter !== 'stations'
    ? (stations.length === 1 ? 'match' : 'matches')
    : (stations.length === 1 ? 'station' : 'stations');
  const selected = stations.find(station => station.id === selectedId);
  const selectedEvidence = selected ? evidence.get(selected.id) ?? [] : [];
  const unavailable = filter === 'e0'
    ? 'No verified E0 outlets in these results.'
    : 'No matching premium-grade evidence in these results.';
  const muted = { color: colors.muted };
  const text = { color: colors.text };
  const accent = { color: colors.accent };
  const outline = { backgroundColor: colors.surface, borderColor: colors.border };

  function changeSearch(source: StationSearchSource, km = radius, refresh = false) {
    if (!refresh) setSelectedId(undefined);
    void run(source, km, refresh);
  }

  function selectStation(id: string) {
    setSelectedId(id);
    setShowSearch(false);
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
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Fuel" onPress={() => router.back()} style={styles.back}>
          <Text style={[styles.link, accent]}>‹ Fuel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, text]}>{premium ? 'Premium Fuel Explorer' : 'Nearby Fuel Stations'}</Text>
        <View style={styles.row}>
          <View style={styles.location}>
            <Text style={[styles.locationTitle, text]}>{origin?.label ?? 'Choose a search location'}</Text>
            <Text style={muted}>Location permission · {permission}</Text>
          </View>
          {chip(showSearch ? 'Hide search' : 'Show search', () => setShowSearch(!showSearch))}
        </View>
        {showSearch && <View style={styles.options}>
          <View style={styles.row}>
            {chip('Use GPS', () => changeSearch('gps'), { disabled: busy })}
            {chip('Mysuru demo', () => changeSearch('demo'), { disabled: busy })}
            {premium && chip('Bengaluru demo', () => changeSearch('bengaluru'), { disabled: busy })}
          </View>
          <View style={styles.row}>
            {(premium ? premiumRadii : radii).map(km => <View key={km}>
              {chip(km + ' km', () => changeSearch('reuse', km), { selected: radius === km, disabled: busy })}
            </View>)}
            {chip('Refresh', () => changeSearch('reuse', radius, true), { disabled: !origin || busy })}
          </View>
          {!premium && <Text style={[styles.small, muted]}>Only a rounded search location is sent to the station provider.</Text>}
        </View>}
        {premium && (
          <View style={styles.filters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {premiumFilters.map(option => <View key={option.id}>
                {chip(option.label, () => { setFilter(option.id); setSelectedId(undefined); }, { selected: option.id === filter })}
              </View>)}
            </ScrollView>
            <Text style={[styles.small, muted]}>Community tags are unverified. Confirm fuel with the outlet.</Text>
          </View>
        )}
        {!hasStationMap && Platform.OS === 'android' && (
          <Text style={[styles.small, muted]}>This build uses the station list. The basemap requires Maps SDK configuration.</Text>
        )}
      </View>

      <View style={styles.content}>
        {mode === 'Map' ? (
          <StationMap center={origin ?? mysuru} searchSelected={!!origin} deviceLocation={deviceLocation}
            radius={radius} stations={stations} selected={selected} onSelect={selectStation} />
        ) : (
          <FlatList
            data={stations}
            keyExtractor={station => station.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={muted}>
                {busy ? 'Searching…' : result ? (premium && filter !== 'stations' ? unavailable : 'No mapped stations in this radius.') : 'Station results appear here after a successful search.'}
              </Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.listItem, outline]}>
                <Pressable accessibilityRole={hasStationMap || premium ? 'button' : undefined}
                  accessibilityLabel={hasStationMap ? item.name + ', show on map' : premium ? item.name + ', view evidence' : undefined}
                  disabled={!hasStationMap && !premium} onPress={() => selectStation(item.id)}>
                  <Text style={[styles.locationTitle, text]}>{item.name}</Text>
                  <Text style={accent}>{item.km.toFixed(2)} km · straight line</Text>
                  {!!item.address && <Text style={muted}>{item.address}</Text>}
                  {premium && <Text style={muted}>{evidence.get(item.id)?.length
                    ? evidence.get(item.id)?.map(entry => gradeName(entry.grade)).join(' · ')
                    : 'Premium availability not confirmed'}</Text>}
                </Pressable>
                {!hasStationMap && <AppButton label="Get Directions" variant="ghost" onPress={() => void directions(item)} />}
              </View>
            )}
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
        {premium && mode === 'Map' && result && !stations.length && filter !== 'stations' && (
          <Text style={[styles.small, muted]}>{unavailable} Try a wider radius or open the grade guide.</Text>
        )}
        {result && (
          <Text style={[styles.small, muted]}>
            {result.source} · Retrieved {new Date(result.fetched).toLocaleString()}{result.limited ? ' · Result limit reached' : ''}
          </Text>
        )}
        {selected && (mode === 'Map' || (premium && !hasStationMap)) && (
          <View style={[styles.details, outline]}>
            <View style={styles.row}>
              <Text style={[styles.detailTitle, text]}>{selected.name}</Text>
              {chip('Hide details', () => setSelectedId(undefined))}
            </View>
            <ScrollView style={premium ? styles.premiumMetadata : styles.metadata} nestedScrollEnabled persistentScrollbar={premium}>
              <Text style={accent}>{selected.km.toFixed(2)} km · straight line</Text>
              {premium && !selectedEvidence.length && <Text style={muted}>Premium availability not confirmed · Ethanol content unknown</Text>}
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
              {!!selected.brand && <Text style={text}>{selected.brand}</Text>}
              {!!selected.address && <Text style={text}>{selected.address}</Text>}
              {!!selected.hours && <Text style={text}>Mapped hours · {selected.hours}</Text>}
              {!premium && !!selected.fuels && <Text style={muted}>Mapped fuel tags · {selected.fuels}. Stock can change.</Text>}
              <Text style={muted}>{selected.source}</Text>
            </ScrollView>
            <AppButton label="Get Directions" variant="secondary" onPress={() => void directions(selected)} />
          </View>
        )}
        <View style={styles.row}>
          {premium && <Text accessibilityRole="link" style={[styles.small, accent, styles.guide]}
            onPress={() => router.push('/fuel/grades')}>Fuel-grade guide and official sources</Text>}
          <Text accessibilityRole="link" style={[styles.small, accent]}
            onPress={() => void Linking.openURL('https://www.geoapify.com/').catch(() => {})}>Powered by Geoapify</Text>
          <Text accessibilityRole="link" style={[styles.small, accent]}
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>© OpenStreetMap contributors</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 14 },
  header: { gap: 6, paddingBottom: 8 },
  back: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingRight: 16 },
  link: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 25, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  location: { flex: 1, minWidth: 135 },
  locationTitle: { fontSize: 15, fontWeight: '700' },
  options: { gap: 5 },
  filters: { gap: 5 },
  filterRow: { flexDirection: 'row', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, borderWidth: 1 },
  chipText: { fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
  content: { flex: 1, minHeight: 120 },
  list: { gap: 8, paddingVertical: 8 },
  listItem: { borderRadius: 12, borderWidth: 1, gap: 5, padding: 12 },
  footer: { gap: 4, paddingTop: 6, paddingBottom: 6 },
  small: { fontSize: 12, lineHeight: 16 },
  details: { borderRadius: 13, borderWidth: 1, padding: 8, gap: 5 },
  detailTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  metadata: { maxHeight: 74 },
  premiumMetadata: { maxHeight: 118 },
  evidence: { gap: 2, paddingTop: 8 },
  guide: { width: '100%', minHeight: 36, textAlignVertical: 'center' },
});
