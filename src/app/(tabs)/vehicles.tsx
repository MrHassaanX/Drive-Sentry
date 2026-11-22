import { useState } from 'react';
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, InlineMessage, LoadingState, PageHeading, Screen } from '../../components/ui';
import { AppIcon } from '../../components/AppIcon';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { deleteVehicle } from '../../features/vehicles/repository';
import type { Vehicle } from '../../features/vehicles/types';

export default function VehiclesScreen() {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const { vehicles, selectedVehicle, selectVehicle, refresh, isLoading, error } = useSelectedVehicle();
  const [actionError, setActionError] = useState<string | null>(null);

  const confirmDelete = (vehicle: Vehicle) => {
    Alert.alert(
      `Delete ${vehicle.name}?`,
      'This permanently deletes the vehicle, its fuel log, service history and schedules from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete vehicle',
          style: 'destructive',
          onPress: () => {
            void deleteVehicle(database, vehicle.id).then(() => {
              setActionError(null);
              return refresh();
            }).catch(() => {
              setActionError('This vehicle could not be deleted. Please try again.');
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.titleRow}>
        <PageHeading title="My vehicles" />
      </View>
      <AppButton label="＋  Add vehicle" onPress={() => router.push('/vehicles/new')} />
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      {isLoading ? <LoadingState /> : error ? <AppButton label="Reload vehicles" onPress={() => void refresh()} /> : vehicles.length === 0 ? (
        <Card style={styles.emptyCard}>
          <AppIcon name="vehicle" color={colors.accent} size={28} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your garage is empty</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Add your car or motorcycle to keep its details in one place.</Text>
          <AppButton label="Add your first vehicle" onPress={() => router.push('/vehicles/new')} />
        </Card>
      ) : (
        <View style={styles.list}>
          {vehicles.map((vehicle) => {
            const selected = vehicle.id === selectedVehicle?.id;
            return (
              <Card key={vehicle.id} style={styles.vehicleCard}>
                <Pressable onPress={() => router.push(`/vehicles/${vehicle.id}`)} accessibilityRole="button" accessibilityLabel={`View ${vehicle.name}`} style={styles.vehicleInfo}>
                  <View style={[styles.badge, { backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised }]}>
                    <Text style={[styles.badgeText, { color: selected ? colors.accent : colors.muted }]}>{vehicle.vehicle_type === 'car' ? 'CAR' : 'BIKE'}</Text>
                  </View>
                  <View style={styles.vehicleText}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.vehicleName, { color: colors.text }]}>{vehicle.name}</Text>
                      {selected ? <Text style={[styles.selectedTag, { color: colors.accent }]}>SELECTED</Text> : null}
                    </View>
                    <Text style={[styles.body, { color: colors.muted }]}>{vehicle.manufacturer} {vehicle.model}{vehicle.model_year ? ` · ${vehicle.model_year}` : ''}</Text>
                    <Text style={[styles.meta, { color: colors.muted }]}>Profile: {vehicle.current_odometer_km.toLocaleString('en-IN')} km · {vehicle.fuel_type}</Text>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  {!selected ? <Pressable accessibilityRole="button" accessibilityLabel={`Set ${vehicle.name} as active`} onPress={() => void selectVehicle(vehicle.id)}><Text style={[styles.actionLink, { color: colors.accent }]}>Set active</Text></Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${vehicle.name}`} onPress={() => router.push(`/vehicles/${vehicle.id}/edit`)}><Text style={[styles.actionLink, { color: colors.muted }]}>Edit</Text></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${vehicle.name}`} onPress={() => confirmDelete(vehicle)}><Text style={[styles.actionLink, { color: colors.danger }]}>Delete</Text></Pressable>
                </View>
              </Card>
            );
          })}
        </View>
      )}
      <Text style={[styles.privacyNote, { color: colors.muted }]}>Vehicle details are stored on this device.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { marginBottom: -4 },
  list: { gap: 12 },
  vehicleCard: { padding: 15, gap: 14 },
  vehicleInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '900' },
  vehicleText: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  vehicleName: { fontSize: 16, fontWeight: '800' },
  selectedTag: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  body: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 11, textTransform: 'capitalize' },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8a999955', paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 18 },
  actionLink: { fontSize: 13, fontWeight: '800' },
  emptyCard: { padding: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '800' },
  privacyNote: { textAlign: 'center', fontSize: 12 },
});
