import { isDevice } from 'expo-device';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { readDeviceLocation, resolveSearchOrigin, type SearchOrigin, type StationSearchSource } from './deviceLocation';

const isEmulator = (Platform.OS === 'android' || Platform.OS === 'ios') && !isDevice;
const deviceReader = {
  permission: Location.getForegroundPermissionsAsync,
  requestPermission: Location.requestForegroundPermissionsAsync,
  servicesEnabled: Location.hasServicesEnabledAsync,
  position: () => Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: false,
    timeInterval: 1000,
  }),
};

export function resolveForegroundLocation(source: StationSearchSource, previous?: SearchOrigin, retry = true) {
  return resolveSearchOrigin(source, previous, () => readDeviceLocation(deviceReader, retry), isEmulator);
}
