import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type MapStyleElement, type Region } from 'react-native-maps';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { StationMapProps } from './mapTypes';
import { groupMapMarkers, selectedMapRadius } from './mapMarkers';
import { stationDisplay } from './displayName';
import type { Point } from './provider';

const hideBusinessLabels: MapStyleElement[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
];
const darkMap: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#192832' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#C5D1DB' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#152129' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#435463' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#6C715D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#153950' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263D36' }] },
  ...hideBusinessLabels,
];

function viewRegion(point: Point, radius: number): Region {
  const latitudeDelta = radius * 2.6 / 111;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / Math.max(0.1, Math.cos(point.latitude * Math.PI / 180)),
  };
}

function MapControl({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function ClusterMarker({ center, count, onPress }: { center: Point; count: number; onPress: () => void }) {
  const { colors } = useAppTheme();
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    // Let Android capture the number after the marker's text has laid out.
    const timer = setTimeout(() => setTracksViewChanges(false), 600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} title={count + ' stations'}
      accessibilityLabel={count + ' stations, zoom in'} tracksViewChanges={tracksViewChanges} onPress={onPress}>
      <View collapsable={false} style={[styles.cluster, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
        <Text style={[styles.clusterLabel, { color: colors.accentText }]}>{count}</Text>
      </View>
    </Marker>
  );
}

export default function StationMap({ center, deviceLocation, radius, stations, selected, onSelect, onLocate }: StationMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [visibleRegion, setVisibleRegion] = useState(() => viewRegion(center, radius));
  const { colors, dark } = useAppTheme();
  const { latitude, longitude } = center;
  const selectedLat = selected?.latitude;
  const selectedLon = selected?.longitude;
  const focusRadius = selected ? selectedMapRadius(stations, selected) : 1;
  const markers = useMemo(() => groupMapMarkers(stations, visibleRegion, selected?.id),
    [stations, visibleRegion, selected?.id]);

  useEffect(() => {
    if (!ready || !laidOut) return;
    if (selectedLat !== undefined && selectedLon !== undefined) {
      map.current?.animateToRegion(viewRegion({ latitude: selectedLat, longitude: selectedLon }, focusRadius), 280);
    } else {
      map.current?.animateToRegion(viewRegion({ latitude, longitude }, radius), 250);
    }
  }, [ready, laidOut, latitude, longitude, radius, selectedLat, selectedLon, focusRadius]);

  function fitStations() {
    const points = stations.length ? [center, ...stations] : [center];
    map.current?.fitToCoordinates(points.map(({ latitude, longitude }) => ({ latitude, longitude })), {
      edgePadding: { top: 28, bottom: 76, left: 32, right: 32 },
      animated: true,
    });
  }

  return (
    <View style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} onLayout={() => setLaidOut(true)}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={viewRegion(center, radius)}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={setVisibleRegion}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={Platform.OS === 'android' ? (dark ? darkMap : hideBusinessLabels) : undefined}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        zoomControlEnabled={false}
        showsPointsOfInterests={false}
        showsCompass
        mapPadding={{ top: 6, left: 6, right: 6, bottom: 52 }}
        accessibilityLabel="Fuel station map"
      >
        <Circle center={center} radius={radius * 1000}
          strokeWidth={1.5} strokeColor={colors.accent} fillColor="rgba(20, 147, 125, 0.10)" />
        {deviceLocation && <Marker coordinate={deviceLocation} title="Your location" pinColor="#2565CE" zIndex={2} />}
        {markers.map(marker => {
          if (marker.kind === 'cluster') {
            return <ClusterMarker key={marker.key + '/' + marker.members.length + '/' + dark}
              center={marker.center} count={marker.members.length}
              onPress={() => map.current?.animateToRegion({
                ...marker.center,
                latitudeDelta: visibleRegion.latitudeDelta / 3,
                longitudeDelta: visibleRegion.longitudeDelta / 3,
              }, 280)} />;
          }
          const display = stationDisplay(marker.station);
          return <Marker
            key={marker.key + (selected?.id === marker.station.id ? '/selected' : '')}
            coordinate={marker.station}
            title={display.title}
            accessibilityLabel={!display.exact && display.secondary ? display.title + ', ' + display.secondary : display.title}
            pinColor={selected?.id === marker.station.id ? '#E57521' : '#087D69'}
            zIndex={selected?.id === marker.station.id ? 3 : 1}
            onPress={() => onSelect(marker.station.id)}
          />;
        })}
      </MapView>
      {ready && laidOut && (
        <View pointerEvents="box-none" style={styles.controls}>
          <MapControl label="My Location" onPress={onLocate} />
          {stations.length > 0 && <MapControl label="Fit stations" onPress={fitStations} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  controls: { position: 'absolute', left: 10, right: 52, bottom: 8, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, elevation: 2 },
  cluster: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: 3, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center' },
  clusterLabel: { fontSize: 13, fontWeight: '800' },
});
