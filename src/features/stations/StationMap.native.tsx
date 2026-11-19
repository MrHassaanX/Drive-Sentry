import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type MapStyleElement, type Region } from 'react-native-maps';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { StationMapProps } from './mapTypes';
import type { Point, Radius } from './provider';

const hideBusinessLabels: MapStyleElement[] = [
  { featureType: 'poi.business', elementType: 'labels', stylers: [{ visibility: 'off' }] },
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

function viewRegion(point: Point, radius: Radius): Region {
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

export default function StationMap({ center, searchSelected, deviceLocation, radius, stations, selected, onSelect }: StationMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const { colors, dark } = useAppTheme();
  const { latitude, longitude } = center;
  const selectedLat = selected?.latitude;
  const selectedLon = selected?.longitude;

  useEffect(() => {
    if (!ready || !laidOut) return;
    if (selectedLat !== undefined && selectedLon !== undefined) {
      map.current?.animateToRegion(viewRegion({ latitude: selectedLat, longitude: selectedLon }, 3), 250);
    } else {
      map.current?.animateToRegion(viewRegion({ latitude, longitude }, radius), 250);
    }
  }, [ready, laidOut, latitude, longitude, radius, selectedLat, selectedLon]);

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
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={Platform.OS === 'android' ? (dark ? darkMap : hideBusinessLabels) : undefined}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        zoomControlEnabled
        mapPadding={{ top: 6, left: 6, right: 6, bottom: 52 }}
        accessibilityLabel="Fuel station map"
      >
        {searchSelected && <Circle center={center} radius={radius * 1000}
          strokeWidth={1.5} strokeColor={colors.accent} fillColor="rgba(20, 147, 125, 0.10)" />}
        {deviceLocation && <Marker coordinate={deviceLocation} title="Your location" pinColor="#2565CE" zIndex={2} />}
        {stations.map(station => (
          <Marker
            key={station.id}
            coordinate={station}
            title={station.name}
            accessibilityLabel={station.name}
            pinColor={selected?.id === station.id ? '#E57521' : '#087D69'}
            zIndex={selected?.id === station.id ? 3 : 1}
            onPress={() => onSelect(station.id)}
          />
        ))}
      </MapView>
      {ready && laidOut && (
        <View pointerEvents="box-none" style={styles.controls}>
          <MapControl label={deviceLocation ? 'My location' : 'Center map'} onPress={() =>
            map.current?.animateToRegion(viewRegion(deviceLocation ?? center, radius), 250)} />
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
});
