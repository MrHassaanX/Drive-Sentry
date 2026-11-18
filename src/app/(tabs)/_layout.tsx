import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';

const tabGlyphs: Record<string, string> = { index: '⌂', fuel: '↗', vehicles: '▣', settings: '⚙' };

export default function TabLayout() {
  const { colors } = useAppTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 62, paddingTop: 5 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20, fontWeight: '700' }}>{tabGlyphs[route.name] ?? '•'}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="fuel" options={{ title: 'Fuel' }} />
      <Tabs.Screen name="maintenance" options={{ title: 'Maintenance' }} />
      <Tabs.Screen name="vehicles" options={{ title: 'My Vehicles' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
