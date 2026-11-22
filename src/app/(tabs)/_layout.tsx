import { Tabs } from 'expo-router';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { useAppTheme } from '../../hooks/useAppTheme';

const tabIcons: Record<string, AppIconName> = { index: 'home', fuel: 'fuel', maintenance: 'service', vehicles: 'vehicle', settings: 'settings' };

export default function TabLayout() {
  const { colors } = useAppTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }) => <AppIcon name={tabIcons[route.name] ?? 'home'} color={color} size={21} />,
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
