import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

const symbols = {
  shield: { ios: 'shield.checkered', android: 'verified_user', web: 'verified_user' },
  home: { ios: 'house', android: 'home', web: 'home' },
  fuel: { ios: 'fuelpump', android: 'local_gas_station', web: 'local_gas_station' },
  service: { ios: 'wrench', android: 'build', web: 'build' },
  vehicle: { ios: 'car.side', android: 'directions_car', web: 'directions_car' },
  bike: { ios: 'motorcycle', android: 'two_wheeler', web: 'two_wheeler' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  map: { ios: 'map', android: 'map', web: 'map' },
  price: { ios: 'indianrupeesign.circle', android: 'currency_rupee', web: 'currency_rupee' },
  premium: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  next: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
} satisfies Record<string, SymbolViewProps['name']>;

export type AppIconName = keyof typeof symbols;

export function AppIcon({ name, color, size = 22 }: { name: AppIconName; color: ColorValue; size?: number }) {
  return <SymbolView name={symbols[name]} tintColor={color} size={size}
    fallback={<Text accessibilityElementsHidden importantForAccessibility="no" style={{ color, fontSize: size }}>·</Text>} />;
}
