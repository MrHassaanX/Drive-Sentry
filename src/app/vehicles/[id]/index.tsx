import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, InlineMessage, PageHeading, Screen } from '../../../components/ui';
import { getVehicle } from '../../../features/vehicles/repository';
import type { Vehicle } from '../../../features/vehicles/types';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function VehicleDetailsScreen() {
  const database = useSQLiteContext();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const { colors } = useAppTheme();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!Number.isSafeInteger(id) || id < 1) return () => { active = false; };
    void getVehicle(database, id).then((result) => {
      if (active) setVehicle(result);
    }).catch(() => {
      if (active) setHasError(true);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [database, id]);

  if (!Number.isSafeInteger(id) || id < 1) return <Screen><PageHeading title="Vehicle not found" subtitle="This vehicle link is not valid." /><AppButton label="Back to My Vehicles" onPress={() => router.replace('/(tabs)/vehicles')} /></Screen>;
  if (isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  if (hasError) return <Screen><InlineMessage tone="error">This vehicle could not be loaded. Return to your garage and try again.</InlineMessage><Link href="/(tabs)/vehicles" style={{ color: colors.accent }}>Back to My Vehicles</Link></Screen>;
  if (!vehicle) return <Screen><PageHeading title="Vehicle not found" subtitle="It may have been removed from this device." /><AppButton label="Back to My Vehicles" onPress={() => router.replace('/(tabs)/vehicles')} /></Screen>;

  return (
    <Screen>
      <Link href="/(tabs)/vehicles" style={{ ...styles.back, color: colors.accent }}>←  My Vehicles</Link>
      <PageHeading eyebrow={vehicle.vehicle_type === 'car' ? 'Car profile' : 'Motorcycle profile'} title={vehicle.name} subtitle={`${vehicle.manufacturer} ${vehicle.model}${vehicle.model_year ? ` · ${vehicle.model_year}` : ''}`} />
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Vehicle details</Text>
        <Detail label="Vehicle type" value={vehicle.vehicle_type === 'car' ? 'Car' : 'Motorcycle'} />
        <Detail label="Fuel type" value={vehicle.fuel_type.toUpperCase()} />
        <Detail label="Profile odometer" value={`${vehicle.current_odometer_km.toLocaleString('en-IN')} km`} />
        <Detail label="Registration number" value={vehicle.registration_number ?? 'Not added'} />
        <Detail label="Model year" value={vehicle.model_year ? String(vehicle.model_year) : 'Not added'} />
      </Card>
      <Card style={{ backgroundColor: colors.surfaceRaised }}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Vehicle history</Text>
        <Text style={[styles.body, { color: colors.muted }]}>Select this vehicle in My Vehicles to see its entries in the Fuel and Maintenance tabs.</Text>
      </Card>
      <AppButton label="Edit vehicle details" onPress={() => router.push(`/vehicles/${vehicle.id}/edit`)} />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.detailRow, { borderBottomColor: colors.border }]}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 14, fontWeight: '800' },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },
  body: { fontSize: 13, lineHeight: 20 },
});
