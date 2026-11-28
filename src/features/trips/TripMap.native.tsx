import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import leaflet from 'leaflet/dist/leaflet.js';
import markercluster from 'leaflet.markercluster/dist/leaflet.markercluster.js';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppButton } from '../../components/ui';
import { validLocation } from '../stations/deviceLocation';
import { leafletDocument, MAP_ORIGIN } from '../stations/leafletDocument';
import type { TripMapProps } from './tripMapTypes';

function safeJSON(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export default function TripMap({ geometry, waypoints, stations, selectedId, onSelect, onPick }: TripMapProps) {
  const { colors, dark } = useAppTheme();
  const reduced = useReducedMotion();
  const source = useMemo(() => ({ html: leafletDocument(leaflet, dark, markercluster, reduced, 'trip'), baseUrl: MAP_ORIGIN }), [dark, reduced]);
  const [ready, setReady] = useState<typeof source>();
  const [missing, setMissing] = useState(false);
  const map = useRef<WebView<unknown>>(null);
  const enabled = ready === source;

  useEffect(() => {
    if (enabled) map.current?.injectJavaScript(`window.showTrip(${safeJSON({ geometry, waypoints })}); window.fitTrip(); true;`);
  }, [enabled, geometry, waypoints]);
  useEffect(() => {
    if (enabled) map.current?.injectJavaScript(`window.showTripStations(${safeJSON(stations ?? [])}); true;`);
  }, [enabled, stations]);
  useEffect(() => {
    if (enabled) map.current?.injectJavaScript(`window.selectOutlet(${safeJSON(selectedId ?? null)}); true;`);
  }, [enabled, stations, selectedId]);

  function receive(raw: string) {
    if (raw.length > 2048) return;
    try {
      const message = JSON.parse(raw);
      if (message.type === 'ready') setReady(source);
      if (message.type === 'tiles' && typeof message.data === 'boolean') setMissing(!message.data);
      if (message.type === 'select' && typeof message.data === 'string' && stations?.some(item => item.id === message.data)) onSelect?.(message.data);
      if (message.type === 'tripPoint' && message.data && validLocation(message.data)) {
        onPick?.({ latitude: message.data.latitude, longitude: message.data.longitude });
      }
      if (message.type === 'attribution') void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {});
    } catch { /* Ignore malformed messages from the map. */ }
  }

  return <View style={styles.wrap}>
    <View style={[styles.frame, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <WebView<unknown> key={String(dark) + String(reduced)} ref={map} style={styles.map} source={source}
        originWhitelist={['https://github.com', 'about:blank']} onShouldStartLoadWithRequest={request =>
          request.url === MAP_ORIGIN || request.url === MAP_ORIGIN + '/' || request.url === 'about:blank'}
        userAgent="DriveSentry/3.0 (+https://github.com/MrHassaanX/Drive-Sentry)"
        cacheEnabled cacheMode="LOAD_DEFAULT" nestedScrollEnabled
        mixedContentMode="never" allowFileAccess={false} setSupportMultipleWindows={false}
        onMessage={event => receive(event.nativeEvent.data)} onError={() => setMissing(true)} />
    </View>
    {missing && <Text style={{ color: colors.muted }}>Basemap tiles unavailable. Route details and the stop list are still available.</Text>}
    <View style={styles.controls}>
      <AppButton label={geometry.length ? 'Fit entire route' : 'Fit map'} disabled={!enabled} variant="secondary"
        onPress={() => map.current?.injectJavaScript('window.fitTrip(); true;')} />
      {!!waypoints.length && <AppButton label="Recenter on start" disabled={!enabled} variant="ghost"
        onPress={() => map.current?.injectJavaScript('window.centerTrip(); true;')} />}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 9 },
  frame: { height: 392, borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  map: { flex: 1 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
