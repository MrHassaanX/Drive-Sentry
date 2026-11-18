import { useState } from 'react';
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, InlineMessage, LoadingState, PageHeading, Screen } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getMaintenanceOverview } from '../../features/maintenance/calculations';
import { deleteMaintenanceRecord, deleteMaintenanceSchedule } from '../../features/maintenance/repository';
import { useMaintenance } from '../../features/maintenance/useMaintenance';
import type { MaintenanceDueState, MaintenanceRecord, MaintenanceSchedule } from '../../features/maintenance/types';

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateLabels: Record<MaintenanceDueState, string> = { 'needs-baseline': 'Needs baseline', upcoming: 'Upcoming', 'due-soon': 'Due soon', 'due-now': 'Due now', overdue: 'Overdue' };
const stateOrder: MaintenanceDueState[] = ['overdue', 'due-now', 'due-soon', 'needs-baseline', 'upcoming'];

export default function MaintenanceScreen() {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const { selectedVehicle } = useSelectedVehicle();
  const { records, schedules, fuelEntries, isLoading, error, refresh } = useMaintenance();
  const [actionError, setActionError] = useState<string | null>(null);
  const confirmRecordDelete = (record: MaintenanceRecord) => Alert.alert('Delete service record?', `Remove the ${record.category} entry from ${record.service_date}?`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void deleteMaintenanceRecord(database, record.id, record.vehicle_id).then(() => { setActionError(null); refresh(); }).catch(() => setActionError('The service record could not be deleted.')); } },
  ]);
  const confirmScheduleDelete = (schedule: MaintenanceSchedule) => Alert.alert('Delete this schedule?', 'Service history will be kept.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete schedule', style: 'destructive', onPress: () => { void deleteMaintenanceSchedule(database, schedule.id, schedule.vehicle_id).then(() => { setActionError(null); refresh(); }).catch(() => setActionError('The schedule could not be deleted.')); } },
  ]);

  if (!selectedVehicle) return <Screen><PageHeading eyebrow="Vehicle care" title="Maintenance" subtitle="Service history and user-defined schedules for each vehicle." /><Card><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Choose a vehicle first</Text><Text style={{ color: colors.muted, lineHeight: 20 }}>Add or select a vehicle in My Vehicles to track its maintenance.</Text><AppButton label="Go to My Vehicles" onPress={() => router.push('/(tabs)/vehicles')} /></Card></Screen>;
  const { currentOdometerKm, latestFuelReading, statuses } = getMaintenanceOverview(selectedVehicle.current_odometer_km, fuelEntries, schedules);

  return <Screen>
    <PageHeading eyebrow={selectedVehicle.name} title="Maintenance" subtitle={`${selectedVehicle.manufacturer} ${selectedVehicle.model}`} />
    {error || actionError ? <InlineMessage tone="error">{actionError ?? error}</InlineMessage> : null}
    <View style={styles.actions}><AppButton label="Add service" onPress={() => router.push('/maintenance/new')} /><AppButton label="Manage schedule" onPress={() => router.push('/maintenance/schedule/new')} variant="secondary" /></View>
    {isLoading ? <LoadingState label="Loading maintenance records…" /> : error ? <AppButton label="Try again" onPress={refresh} /> : <>
      <Text style={[styles.body, { color: colors.muted }]}>Profile: {selectedVehicle.current_odometer_km.toLocaleString('en-IN')} km · Latest fuel: {latestFuelReading ? `${latestFuelReading.odometer_km.toLocaleString('en-IN')} km` : 'No reading'}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>Distance checks use the higher reading ({currentOdometerKm.toLocaleString('en-IN')} km). Date estimates use dated fuel readings only.</Text>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Maintenance attention</Text>
      {statuses.length === 0 ? <Card><Text style={{ color: colors.muted, lineHeight: 20 }}>No active service schedules yet. Add schedules using intervals you choose.</Text></Card> : statuses.slice().sort((a, b) => stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state)).map((status) => <Card key={status.schedule.id} style={status.state === 'overdue' ? { borderColor: colors.danger } : undefined}>
        <View style={styles.row}><Text style={[styles.cardTitle, { color: colors.text }]}>{status.schedule.category}</Text><Text style={[styles.status, { color: status.state === 'overdue' || status.state === 'due-now' ? colors.danger : colors.accent }]}>{stateLabels[status.state]}</Text></View>
        {status.remainingKm !== null ? <Text style={[styles.body, { color: colors.muted }]}>{status.remainingKm < 0 ? `${Math.abs(status.remainingKm).toLocaleString('en-IN')} km past interval` : `${status.remainingKm.toLocaleString('en-IN')} km remaining`} · next at {status.nextOdometerKm?.toLocaleString('en-IN')} km</Text> : null}
        {status.remainingDays !== null ? <Text style={[styles.body, { color: colors.muted }]}>{status.remainingDays < 0 ? `${Math.abs(status.remainingDays)} days past interval` : `${status.remainingDays} days remaining`} · due {status.nextDate}</Text> : null}
        {status.state === 'needs-baseline' || (status.schedule.interval_months !== null && status.nextDate === null) ? <Text style={[styles.body, { color: colors.muted }]}>Enter a known baseline in the schedule or link a completed service to calculate the missing due threshold.</Text> : null}
        {status.estimatedDueDate ? <Text style={[styles.body, { color: colors.muted }]}>Estimated date from recorded fuel odometer history: {status.estimatedDueDate}</Text> : null}
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.push(`/maintenance/schedule/${status.schedule.id}/edit`)}><Text style={{ color: colors.accent, fontWeight: '800' }}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmScheduleDelete(status.schedule)}><Text style={{ color: colors.danger, fontWeight: '800' }}>Delete</Text></Pressable></View>
      </Card>)}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Schedules</Text>
      {schedules.length === 0 ? <Card><Text style={{ color: colors.muted }}>Your schedules will appear here after you add one.</Text><AppButton label="Create a schedule" onPress={() => router.push('/maintenance/schedule/new')} variant="secondary" /></Card> : schedules.filter((item) => item.enabled === 0).map((schedule) => <Card key={schedule.id}><View style={styles.row}><Text style={[styles.cardTitle, { color: colors.text }]}>{schedule.category}</Text><Text style={{ color: colors.muted }}>Disabled</Text></View><Text style={[styles.body, { color: colors.muted }]}>{schedule.interval_km ? `Every ${schedule.interval_km.toLocaleString('en-IN')} km` : ''}{schedule.interval_km && schedule.interval_months ? ' or ' : ''}{schedule.interval_months ? `every ${schedule.interval_months} months` : ''}</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.push(`/maintenance/schedule/${schedule.id}/edit`)}><Text style={{ color: colors.accent, fontWeight: '800' }}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmScheduleDelete(schedule)}><Text style={{ color: colors.danger, fontWeight: '800' }}>Delete</Text></Pressable></View></Card>)}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Service history</Text>
      {records.length === 0 ? <Card><Text style={{ color: colors.text, fontWeight: '800' }}>No service records yet</Text><Text style={[styles.body, { color: colors.muted }]}>Completed work and planned service entries will be stored for this vehicle.</Text><AppButton label="Add your first service" onPress={() => router.push('/maintenance/new')} /></Card> : records.map((record) => <Card key={record.id}>
        <View style={styles.row}><Text style={[styles.cardTitle, { color: colors.text }]}>{record.category}</Text><Text style={{ color: colors.muted }}>{record.completed ? 'Completed' : 'Planned'}</Text></View>
        <Text style={[styles.body, { color: colors.muted }]}>{record.service_date} · {record.odometer_km.toLocaleString('en-IN')} km · {money(record.cost_paise)}</Text>
        {record.workshop ? <Text style={[styles.body, { color: colors.muted }]}>{record.workshop}</Text> : null}
        {record.notes ? <Text style={[styles.body, { color: colors.muted }]}>{record.notes}</Text> : null}
        <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${record.category}`} onPress={() => router.push(`/maintenance/${record.id}/edit`)}><Text style={{ color: colors.accent, fontWeight: '800' }}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.category}`} onPress={() => confirmRecordDelete(record)}><Text style={{ color: colors.danger, fontWeight: '800' }}>Delete</Text></Pressable></View>
      </Card>)}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, sectionTitle: { fontSize: 19, fontWeight: '800' }, cardTitle: { flex: 1, fontSize: 16, fontWeight: '800' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, status: { fontSize: 12, fontWeight: '900' }, body: { fontSize: 13, lineHeight: 19 } });
