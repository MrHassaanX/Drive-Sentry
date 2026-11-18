import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { getMaintenanceRecord, listMaintenanceSchedules, saveMaintenanceRecord } from './repository';
import { getLocalDateOnly } from './calculations';
import type { MaintenanceSchedule } from './types';
import type { Vehicle } from '../vehicles/types';
import { parseServiceCostPaise } from './validation';

const categories = ['Engine oil', 'Oil filter', 'Air filter', 'Brake inspection/service', 'Tyres', 'Battery', 'Coolant', 'General servicing', 'Other'];
const today = () => getLocalDateOnly();

export function MaintenanceEditor() {
  const { selectedVehicle } = useSelectedVehicle();
  const params = useLocalSearchParams<{ id?: string }>();
  const recordId = params.id === undefined ? undefined : Number(params.id);
  if (!selectedVehicle) return <Screen><PageHeading title="Add service" /><InlineMessage>Select a vehicle before adding a maintenance record.</InlineMessage></Screen>;
  return <MaintenanceForm key={`${selectedVehicle.id}:${recordId}`} selectedVehicle={selectedVehicle} recordId={recordId} />;
}

function MaintenanceForm({ selectedVehicle, recordId }: { selectedVehicle: Vehicle; recordId?: number }) {
  const database = useSQLiteContext();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [category, setCategory] = useState('Engine oil');
  const [customCategory, setCustomCategory] = useState('');
  const [serviceDate, setServiceDate] = useState(today());
  const [odometerKm, setOdometerKm] = useState(String(selectedVehicle?.current_odometer_km ?? ''));
  const [costRupees, setCostRupees] = useState('0');
  const [workshop, setWorkshop] = useState('');
  const [notes, setNotes] = useState('');
  const [completed, setCompleted] = useState(true);
  const [scheduleId, setScheduleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listMaintenanceSchedules(database, selectedVehicle.id),
      recordId !== undefined && Number.isSafeInteger(recordId) && recordId > 0
        ? getMaintenanceRecord(database, recordId, selectedVehicle.id) : Promise.resolve(null),
    ]).then(([nextSchedules, record]) => {
      if (!active) return;
      if (recordId !== undefined && !record) { setError('That service record is unavailable for this vehicle.'); return; }
      setSchedules(nextSchedules);
      if (record) {
        const known = categories.includes(record.category);
        setCategory(known ? record.category : 'Other');
        setCustomCategory(known ? '' : record.category);
        setServiceDate(record.service_date);
        setOdometerKm(String(record.odometer_km));
        setCostRupees((record.cost_paise / 100).toFixed(2));
        setWorkshop(record.workshop ?? '');
        setNotes(record.notes ?? '');
        setCompleted(record.completed === 1);
        setScheduleId(record.schedule_id === null ? '' : String(record.schedule_id));
      }
      setReady(true);
    }).catch(() => { if (active) setError('The service form could not be loaded.'); });
    return () => { active = false; };
  }, [database, recordId, selectedVehicle.id]);

  const onSave = async () => {
    if (!ready) return;
    const finalCategory = category === 'Other' && customCategory.trim() ? customCategory.trim() : category;
    const odo = Number(odometerKm);
    const costPaise = parseServiceCostPaise(costRupees);
    if (!/^\d+$/.test(odometerKm.trim()) || !Number.isSafeInteger(odo)) { setError('Enter a non-negative whole odometer reading.'); return; }
    if (costPaise === null) { setError('Enter a valid cost with up to two decimal places.'); return; }
    setSaving(true); setError(null);
    try {
      await saveMaintenanceRecord(database, { vehicleId: selectedVehicle.id, scheduleId: scheduleId ? Number(scheduleId) : null,
        category: finalCategory, serviceDate: serviceDate.trim(), odometerKm: odo, costPaise, workshop: workshop || null, notes: notes || null, completed }, recordId);
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Service record could not be saved.'); }
    finally { setSaving(false); }
  };

  if (!ready) return <Screen>{error ? <InlineMessage tone="error">{error}</InlineMessage> : <LoadingState label="Loading service form…" />}<AppButton label="Cancel" onPress={() => router.back()} variant="secondary" /></Screen>;

  return <Screen>
    <PageHeading eyebrow={selectedVehicle.name} title={recordId ? 'Edit service' : 'Add service'} subtitle="Keep a dated record of work done on this vehicle." />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    <Card>
      <ChoiceField label="Service category" value={category} options={categories.map((value) => ({ value, label: value }))} onChange={setCategory} />
      {category === 'Other' ? <TextField label="Custom category" value={customCategory} onChangeText={setCustomCategory} maxLength={80} placeholder="e.g. chain adjustment" /> : null}
      <TextField label="Service date (YYYY-MM-DD)" value={serviceDate} onChangeText={setServiceDate} placeholder="2026-11-18" />
      <TextField label="Odometer at service (km)" value={odometerKm} onChangeText={setOdometerKm} keyboardType="numeric" />
      <TextField label="Cost (₹)" value={costRupees} onChangeText={setCostRupees} keyboardType="decimal-pad" />
      <TextField label="Mechanic or workshop (optional)" value={workshop} onChangeText={setWorkshop} maxLength={120} />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} style={styles.notes} />
      <ChoiceField label="Record status" value={completed ? 'completed' : 'planned'} options={[{ value: 'completed', label: 'Completed' }, { value: 'planned', label: 'Planned' }]} onChange={(value) => setCompleted(value === 'completed')} />
      {schedules.length ? <ChoiceField label="Update schedule (optional)" value={scheduleId} options={[{ value: '', label: 'No schedule' }, ...schedules.map((item) => ({ value: String(item.id), label: item.category }))]} onChange={setScheduleId} /> : null}
      <AppButton label={recordId ? 'Save changes' : 'Save service'} onPress={() => void onSave()} loading={saving} />
      <AppButton label="Cancel" onPress={() => router.back()} variant="secondary" />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({ notes: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 } });
