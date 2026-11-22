import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import leaflet from 'leaflet/dist/leaflet.js';
import { useAppTheme } from '../../hooks/useAppTheme';
import { stationBrand } from './brands';
import { stationDisplay } from './displayName';
import { leafletDocument, MAP_ORIGIN } from './leafletDocument';
import { groupMapMarkers, selectedMapRadius } from './mapMarkers';
import type { StationMapProps } from './mapTypes';
import { distance, type Point } from './provider';

const credits = 'https://www.openstreetmap.org/copyright';
const brands: Record<string, [string, string]> = {
  'Hindustan Petroleum': ['HP', '#1957a6'],
  IndianOil: ['IO', '#a34610'],
  'Bharat Petroleum': ['BP', '#7c5600'],
  Shell: ['S', '#7b4b00'],
  'Jio-bp': ['J', '#006e71'],
  Nayara: ['N', '#623ba2'],
};
type Region = Point & { latitudeDelta: number; longitudeDelta: number };

function validRegion(value: Region) {
  return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
    value.latitudeDelta > 0 && value.latitudeDelta <= 180 && value.longitudeDelta > 0 &&
    value.longitudeDelta <= 360;
}

function MapControl({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
  </Pressable>;
}

export default function StationMap({ center, locationLabel, showDiagnostics, radius, stations, selected,
  onSelect, onLocate, onSearchHere }: StationMapProps) {
  const map = useRef<WebView<unknown>>(null);
  const { colors, dark } = useAppTheme();
  const [loadedTheme, setLoadedTheme] = useState<boolean>();
  const [tilesMissing, setTilesMissing] = useState(false);
  const [region, setRegion] = useState<Region>();
  const ready = loadedTheme === dark;
  const source = useMemo(() => ({ html: leafletDocument(leaflet, dark), baseUrl: MAP_ORIGIN }), [dark]);
  const { latitude, longitude } = center;
  const targetLat = selected?.latitude ?? latitude;
  const targetLon = selected?.longitude ?? longitude;
  const focus = selected ? selectedMapRadius(stations, selected) : radius;
  const markers = useMemo(() => groupMapMarkers(stations, region ?? {
    latitude, longitude, latitudeDelta: radius * 0.025, longitudeDelta: radius * 0.025,
  }, selected?.id).map(item => {
    if (item.kind === 'cluster') return { center: item.center, count: item.members.length };
    const active = item.station.id === selected?.id;
    const [symbol, color] = brands[stationBrand(item.station)] ?? ['•', '#087968'];
    const { id, latitude, longitude } = item.station;
    return { station: { id, latitude, longitude }, title: stationDisplay(item.station).title,
      symbol, color: active ? '#a94a0b' : color, selected: active };
  }), [stations, region, latitude, longitude, radius, selected?.id]);

  useEffect(() => {
    if (ready) map.current?.injectJavaScript(
      `window.focusOutlets(${JSON.stringify({ latitude: targetLat, longitude: targetLon })}, ${focus * 1.08 / 111}); true;`);
  }, [ready, targetLat, targetLon, focus]);

  useEffect(() => {
    if (ready) map.current?.injectJavaScript(
      `window.showOutlets(${JSON.stringify({ center: { latitude, longitude }, locationLabel, radius, markers })}); true;`);
  }, [ready, latitude, longitude, locationLabel, radius, markers]);

  function receive(raw: string) {
    try {
      const event = JSON.parse(raw);
      if (event.type === 'ready') setLoadedTheme(dark);
      if (event.type === 'region' && validRegion(event.data)) setRegion(event.data);
      if (event.type === 'tiles' && typeof event.data === 'boolean') setTilesMissing(!event.data);
      if (event.type === 'select' && stations.some(station => station.id === event.data)) onSelect(event.data);
      if (event.type === 'attribution') void Linking.openURL(credits).catch(() => {});
    } catch { /* Ignore malformed messages from the map. */ }
  }

  return <View style={[styles.frame, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
    <WebView<unknown> key={String(dark)} ref={map} style={styles.map} source={source} cacheEnabled cacheMode="LOAD_DEFAULT"
      originWhitelist={['https://github.com', 'about:blank']} onShouldStartLoadWithRequest={request =>
        request.url === MAP_ORIGIN || request.url === MAP_ORIGIN + '/' || request.url === 'about:blank'}
      userAgent={'DriveSentry/3.0 (+https://github.com/MrHassaanX/Drive-Sentry)'}
      mixedContentMode="never" allowFileAccess={false} setSupportMultipleWindows={false}
      onError={() => setTilesMissing(true)} onMessage={event => receive(event.nativeEvent.data)} />
    {tilesMissing && <Text style={[styles.notice, { color: colors.text, backgroundColor: colors.surface }]}>
      Basemap tiles unavailable. Outlet results are still available.
    </Text>}
    <View pointerEvents="box-none" style={styles.controls}>
      <MapControl label="My Location" onPress={onLocate} />
      {!!stations.length && <MapControl label="Fit stations" onPress={() => {
        const points = [center, ...stations].map(({ latitude, longitude }) => ({ latitude, longitude }));
        map.current?.injectJavaScript(`window.fitOutlets(${JSON.stringify(points)}); true;`);
      }} />}
      {region && onSearchHere && !selected && distance(region, center) > 0.5 &&
        <MapControl label="Search this area" onPress={() => onSearchHere(region)} />}
    </View>
    {__DEV__ && showDiagnostics && region && (
      <Text pointerEvents="none" style={[styles.notice, { color: colors.text, backgroundColor: colors.surface }]}>
        {`Map center: ${region.latitude.toFixed(6)}, ${region.longitude.toFixed(6)}`}
      </Text>
    )}
  </View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  map: { backgroundColor: 'transparent' },
  controls: { position: 'absolute', left: 8, right: 8, bottom: 22, flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  button: { minHeight: 40, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, elevation: 2 },
  notice: { position: 'absolute', top: 8, left: 8, padding: 5, fontSize: 12, maxWidth: '92%' },
});
