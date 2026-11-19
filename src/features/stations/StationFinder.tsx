import { useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, InlineMessage } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { mysuru, type Point, type Radius } from './provider';
import StationMap from './StationMap';
import { useStationSearch } from './useStationSearch';

const radii: Radius[] = [3, 5, 10];

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

export default function StationFinder() {
  const { colors } = useAppTheme();
  const { permission, origin, deviceLocation, radius, result, message, busy, run } = useStationSearch();
  const [mode, setMode] = useState<'Map' | 'List'>(Platform.OS === 'web' ? 'List' : 'Map');
  const [showSearch, setShowSearch] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const stations = result?.stations ?? [];
  const selected = stations.find(station => station.id === selectedId);
  const muted = { color: colors.muted };
  const text = { color: colors.text };
  const accent = { color: colors.accent };
  const outline = { backgroundColor: colors.surface, borderColor: colors.border };

  function changeSearch(source: 'gps' | 'demo' | 'reuse', km = radius, refresh = false) {
    if (!refresh) setSelectedId(undefined);
    void run(source, km, refresh);
  }

  function selectStation(id: string) {
    setSelectedId(id);
    setShowSearch(false);
    setMode('Map');
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
        <Text accessibilityRole="header" style={[styles.title, text]}>Nearby Fuel Stations</Text>
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
          </View>
          <View style={styles.row}>
            {radii.map(km => <View key={km}>
              {chip(km + ' km', () => changeSearch('reuse', km), { selected: radius === km, disabled: busy })}
            </View>)}
            {chip('Refresh', () => changeSearch('reuse', radius, true), { disabled: !origin || busy })}
          </View>
          <Text style={[styles.small, muted]}>Only a rounded search location is sent to the station provider.</Text>
        </View>}
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
                {busy ? 'Searching…' : result ? 'No mapped stations in this radius.' : 'Station results appear here after a successful search.'}
              </Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.listItem, outline]}>
                <Pressable accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                  accessibilityLabel={Platform.OS === 'web' ? undefined : item.name + ', show on map'}
                  disabled={Platform.OS === 'web'} onPress={() => selectStation(item.id)}>
                  <Text style={[styles.locationTitle, text]}>{item.name}</Text>
                  <Text style={accent}>{item.km.toFixed(2)} km · straight line</Text>
                  {!!item.address && <Text style={muted}>{item.address}</Text>}
                </Pressable>
                {Platform.OS === 'web' && <AppButton label="Get Directions" variant="ghost" onPress={() => void directions(item)} />}
              </View>
            )}
          />
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.row}>
          <View style={styles.location}>
            <Text accessibilityLiveRegion="polite" style={[styles.locationTitle, text]}>
              {busy ? 'Searching…' : result ? stations.length + ' stations within ' + radius + ' km' : 'Fuel station map'}
            </Text>
            {result && <Text style={muted}>{result.status}</Text>}
          </View>
          {Platform.OS !== 'web' && chip('Map', () => setMode('Map'), { selected: mode === 'Map' })}
          {Platform.OS !== 'web' && chip('List', () => setMode('List'), { selected: mode === 'List' })}
        </View>
        {message ? <InlineMessage tone="error">{message}</InlineMessage> : null}
        {result && (
          <Text style={[styles.small, muted]}>
            {result.source} · Retrieved {new Date(result.fetched).toLocaleString()}{result.limited ? ' · Result limit reached' : ''}
          </Text>
        )}
        {selected && mode === 'Map' && (
          <View style={[styles.details, outline]}>
            <View style={styles.row}>
              <Text style={[styles.detailTitle, text]}>{selected.name}</Text>
              {chip('Hide details', () => setSelectedId(undefined))}
            </View>
            <ScrollView style={styles.metadata} nestedScrollEnabled>
              <Text style={accent}>{selected.km.toFixed(2)} km · straight line</Text>
              {!!selected.brand && <Text style={text}>{selected.brand}</Text>}
              {!!selected.address && <Text style={text}>{selected.address}</Text>}
              {!!selected.hours && <Text style={text}>Mapped hours · {selected.hours}</Text>}
              {!!selected.fuels && <Text style={muted}>Mapped fuel tags · {selected.fuels}. Stock can change.</Text>}
              <Text style={muted}>{selected.source}</Text>
            </ScrollView>
            <AppButton label="Get Directions" variant="secondary" onPress={() => void directions(selected)} />
          </View>
        )}
        <View style={styles.row}>
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
});
