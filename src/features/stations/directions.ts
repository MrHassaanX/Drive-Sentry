import { Alert, Linking, Platform } from 'react-native';
import type { Point } from './provider';

export async function directions(point: Point) {
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
