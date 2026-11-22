import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppIcon } from './AppIcon';
import { useAppTheme } from '../hooks/useAppTheme';

const links = [
  { title: 'Fuel Map', detail: 'Find nearby stations', path: '/fuel/nearby', icon: 'map' },
  { title: 'Fuel Prices', detail: 'Outlet observations and city references', path: '/fuel/prices', icon: 'price' },
  { title: 'E0 Explorer', detail: 'Find outlets with verified ethanol-free petrol', path: '/fuel/premium', icon: 'premium' },
] as const;

export function FuelAssistant({ compact = false }: { compact?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={styles.group}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Fuel Assistant</Text>
    <View style={[styles.items, compact && styles.compact]}>
      {(compact ? links.slice(0, 2) : links).map(({ title, detail, path, icon }) => (
        <Pressable key={path} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            router.push(path);
          }}
          style={({ pressed }) => [styles.item, compact && styles.tile, {
            backgroundColor: icon === 'map' ? colors.accentSoft : colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          }]}>
          <View style={[styles.icon, { backgroundColor: icon === 'map' ? colors.accent : colors.surfaceRaised }]}>
            <AppIcon name={icon} color={icon === 'map' ? colors.accentText : colors.accent} />
          </View>
          <View style={compact ? undefined : styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {!compact && <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text>}
          </View>
          {!compact && <AppIcon name="next" color={colors.muted} size={18} />}
        </Pressable>
      ))}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  heading: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  items: { gap: 9 },
  compact: { flexDirection: 'row' },
  item: { minHeight: 72, padding: 13, gap: 12, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center' },
  tile: { alignItems: 'flex-start', flex: 1, flexDirection: 'column', gap: 9 },
  copy: { flex: 1, gap: 4 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  title: { fontSize: 16, fontWeight: '800' },
  detail: { fontSize: 12, lineHeight: 17 },
});
