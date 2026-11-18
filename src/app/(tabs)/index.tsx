import { Link, router } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { AppButton, Card, InlineMessage, LoadingState, Metric, PageHeading, Screen } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useFuelEntries } from '../../features/fuel/useFuelEntries';
import { formatRupees } from '../../features/fuel/formatters';
import { getMaintenanceOverview } from '../../features/maintenance/calculations';
import { getLatestFuelReading } from '../../features/fuel/calculations';
import { useMaintenance } from '../../features/maintenance/useMaintenance';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { vehicles, selectedVehicle, isLoading, error, selectVehicle, clearError } = useSelectedVehicle();
  const { insights: fuelInsights, isLoading: fuelIsLoading, error: fuelError } = useFuelEntries();
  const { schedules, fuelEntries: maintenanceFuelEntries, isLoading: maintenanceIsLoading, error: maintenanceError } = useMaintenance();
  const latestFuelReading = getLatestFuelReading(fuelInsights.entries);
  const maintenanceStatuses = selectedVehicle
    ? getMaintenanceOverview(selectedVehicle.current_odometer_km, maintenanceFuelEntries, schedules).statuses : [];
  const overdueCount = maintenanceStatuses.filter(({ state }) => state === 'overdue').length;
  const dueNowCount = maintenanceStatuses.filter(({ state }) => state === 'due-now').length;
  const dueSoonCount = maintenanceStatuses.filter(({ state }) => state === 'due-soon').length;
  const needsBaseline = maintenanceStatuses.some(({ state }) => state === 'needs-baseline');
  const maintenanceSummary = maintenanceError ?? (maintenanceIsLoading
    ? 'Loading maintenance information…'
    : overdueCount > 0
      ? `${overdueCount} overdue service${overdueCount === 1 ? '' : 's'} need attention.`
      : dueNowCount > 0
        ? `${dueNowCount} scheduled service${dueNowCount === 1 ? '' : 's'} reached its due threshold.`
        : dueSoonCount > 0
          ? `Scheduled services due soon: ${dueSoonCount}.`
          : needsBaseline
            ? 'Review schedules that need a baseline.'
            : maintenanceStatuses.length ? 'No services due soon.' : 'No active service schedules yet.');
  const fuelStatus = fuelError ?? (fuelIsLoading
    ? 'Loading saved fuel records…'
    : selectedVehicle?.fuel_type === 'electric' && fuelInsights.entries.length === 0
    ? 'Charging records are not available yet.'
    : fuelInsights.entries.length === 0
      ? 'No refuelling records yet.'
      : `${formatRupees(fuelInsights.monthSpendPaise)} spent this month${fuelInsights.latestMileage ? ` · ${fuelInsights.latestMileage.efficiencyKmPerUnit.toFixed(1)} km/${fuelInsights.latestMileage.quantityUnit === 'kg' ? 'kg' : 'L'} latest recorded` : ''}.`);

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}><Text style={[styles.brandGlyph, { color: colors.accentText }]}>D</Text></View>
        <View><Text style={[styles.brandName, { color: colors.text }]}>DriveSentry</Text><Text style={[styles.brandTag, { color: colors.muted }]}>SMART VEHICLE MANAGEMENT</Text></View>
      </View>
      <PageHeading eyebrow="Your overview" title="Your garage, at a glance." subtitle="A clear record of the vehicles you own and care for." />

      {error ? <InlineMessage tone="error">{error} <Text onPress={() => { clearError(); }} style={{ fontWeight: '800' }}>Dismiss</Text></InlineMessage> : null}

      {selectedVehicle ? (
        <>
          <Card style={[styles.vehicleHero, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.heroTop}>
              <View style={[styles.vehicleIcon, { backgroundColor: colors.accentSoft }]}><Text style={{ fontSize: 22 }}>{selectedVehicle.vehicle_type === 'car' ? 'CAR' : 'BIKE'}</Text></View>
              <View style={styles.heroTitle}>
                <Text style={[styles.kicker, { color: colors.accent }]}>SELECTED VEHICLE</Text>
                <Text style={[styles.vehicleName, { color: colors.text }]}>{selectedVehicle.name}</Text>
                <Text style={[styles.vehicleMeta, { color: colors.muted }]}>{selectedVehicle.manufacturer} {selectedVehicle.model}</Text>
              </View>
            </View>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <View style={styles.metricRow}>
              <Metric label="PROFILE ODOMETER" value={selectedVehicle.current_odometer_km.toLocaleString('en-IN')} suffix="km" />
              <Metric label="FUEL TYPE" value={selectedVehicle.fuel_type.toUpperCase()} />
            </View>
            {latestFuelReading ? <Text style={[styles.body, { color: colors.muted }]}>Latest fuel reading: {latestFuelReading.odometer_km.toLocaleString('en-IN')} km</Text> : null}
            <AppButton label="View vehicle details" onPress={() => router.push(`/vehicles/${selectedVehicle.id}`)} variant="secondary" />
          </Card>

          {vehicles.length > 1 ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Switch vehicle</Text>
              <View style={styles.switchList}>
                {vehicles.filter((vehicle) => vehicle.id !== selectedVehicle.id).map((vehicle) => (
                  <Pressable key={vehicle.id} accessibilityRole="button" accessibilityLabel={`Select ${vehicle.name}`} onPress={() => void selectVehicle(vehicle.id)}>
                    <Text style={[styles.switchItem, { color: colors.accent }]}>{vehicle.name} · {vehicle.manufacturer} {vehicle.model}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      ) : isLoading ? <LoadingState /> : (
        <Card style={styles.emptyCard}>
          <View style={[styles.emptyMark, { backgroundColor: colors.accentSoft }]}><Text style={[styles.emptyMarkText, { color: colors.accent }]}>01</Text></View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Start with your first vehicle</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Add a car or motorcycle to create your personal vehicle record. Your information stays on this device.</Text>
          <AppButton label="Add your first vehicle" onPress={() => router.push('/vehicles/new')} />
        </Card>
      )}

      <Card style={styles.countCard}>
        <Metric label="REGISTERED VEHICLES" value={String(vehicles.length)} suffix={vehicles.length === 1 ? 'vehicle' : 'vehicles'} />
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Insights</Text>
        <Text style={[styles.comingSoon, { color: colors.muted }]}>BASED ON YOUR RECORDS</Text>
      </View>
      <View style={styles.insightRow}>
        <Card style={styles.insightCard}>
          <Text style={[styles.insightGlyph, { color: colors.accent }]}>₹</Text>
          <Text style={[styles.insightTitle, { color: colors.text }]}>Fuel spending</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{fuelStatus}</Text>
        </Card>
        <Card style={styles.insightCard}>
          <Text style={[styles.insightGlyph, { color: colors.accent }]}>↗</Text>
          <Text style={[styles.insightTitle, { color: colors.text }]}>Maintenance</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{maintenanceSummary}</Text>
        </Card>
      </View>
      {selectedVehicle ? <Link href="/(tabs)/fuel" asChild><Text style={[styles.link, { color: colors.accent }]}>View fuel log →</Text></Link> : null}
      {selectedVehicle ? <Link href="/(tabs)/maintenance" asChild><Text style={[styles.link, { color: colors.accent }]}>{overdueCount > 0 ? 'Review overdue maintenance →' : 'View maintenance →'}</Text></Link> : null}
      {vehicles.length > 0 ? <Link href="/(tabs)/vehicles" asChild><Text style={[styles.link, { color: colors.accent }]}>Manage all vehicles →</Text></Link> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 4 },
  brandMark: { height: 38, width: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  brandGlyph: { fontWeight: '900', fontSize: 21 },
  brandName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  brandTag: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },
  vehicleHero: { gap: 17 },
  countCard: { paddingVertical: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  vehicleIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { flex: 1, gap: 3 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  vehicleName: { fontSize: 21, fontWeight: '800' },
  vehicleMeta: { fontSize: 13 },
  rule: { height: 1 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  comingSoon: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  insightRow: { flexDirection: 'row', gap: 10 },
  insightCard: { flex: 1, minHeight: 155, padding: 14, gap: 8 },
  insightGlyph: { fontSize: 23, fontWeight: '800' },
  insightTitle: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  emptyCard: { padding: 20 },
  emptyMark: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyMarkText: { fontWeight: '900', fontSize: 15 },
  switchList: { gap: 12 },
  switchItem: { fontSize: 14, fontWeight: '700', paddingVertical: 6 },
  link: { fontSize: 14, fontWeight: '800', alignSelf: 'flex-start' },
});
