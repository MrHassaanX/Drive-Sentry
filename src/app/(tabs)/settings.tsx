import { Text, View, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

import { Card, PageHeading, Screen } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function SettingsScreen() {
  const { colors, dark } = useAppTheme();
  const { vehicles } = useSelectedVehicle();
  const config = Constants.expoConfig;
  const academic = config?.extra?.buildProfile === 'academic-testing';

  return (
    <Screen>
      <PageHeading eyebrow="Preferences" title="Settings" subtitle="A few details about how DriveSentry works on this device." />
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
        <View style={styles.settingRow}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <View style={styles.settingCopy}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>System theme</Text>
            <Text style={[styles.body, { color: colors.muted }]}>DriveSentry follows your device appearance. Currently using {dark ? 'dark' : 'light'} mode.</Text>
          </View>
        </View>
      </Card>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Your data</Text>
        <Text style={[styles.body, { color: colors.muted }]}>Vehicle profiles, fuel logs and service records are saved in SQLite on this device.</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.countText, { color: colors.accent }]}>{vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'} saved on this device</Text>
        </View>
      </Card>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>About DriveSentry</Text>
        <Text style={[styles.settingTitle, { color: colors.text }]}>{academic ? 'College Demo · Academic testing' : 'DriveSentry · Release profile'}</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Version {config?.version ?? 'unknown'} · Build {config?.extra?.androidBuild ?? 'unknown'} · {config?.extra?.buildRevision ?? 'local'}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 17, fontWeight: '800' },
  settingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { height: 10, width: 10, borderRadius: 5, marginTop: 5 },
  settingCopy: { flex: 1, gap: 4 },
  settingTitle: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 20 },
  small: { fontSize: 11 },
  countBadge: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  countText: { fontSize: 12, fontWeight: '800' },
});
