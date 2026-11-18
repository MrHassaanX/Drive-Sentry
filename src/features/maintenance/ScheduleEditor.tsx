import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getMaintenanceSchedule, saveMaintenanceSchedule } from './repository';
import type { Vehicle } from '../vehicles/types';

export function ScheduleEditor() {
  const { selectedVehicle } = useSelectedVehicle();
  const params = useLocalSearchParams<{ id?: string }>();
  const scheduleId = params.id === undefined ? undefined : Number(params.id);
  if (!selectedVehicle) return <Screen><PageHeading title="Maintenance schedule" /><InlineMessage>Select a vehicle first.</InlineMessage></Screen>;
  return <ScheduleForm key={`${selectedVehicle.id}:${scheduleId}`} selectedVehicle={selectedVehicle} scheduleId={scheduleId} />;
}

function ScheduleForm({ selectedVehicle, scheduleId }: { selectedVehicle: Vehicle; scheduleId?: number }) {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const [category, setCategory] = useState('Engine oil');
  const [intervalKm, setIntervalKm] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [baselineOdometerKm, setBaselineOdometerKm] = useState('');
  const [baselineDate, setBaselineDate] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(scheduleId === undefined);

  useEffect(() => {
    if (scheduleId === undefined) return;
    let active = true;
    const result = Number.isSafeInteger(scheduleId) && scheduleId > 0
      ? getMaintenanceSchedule(database, scheduleId, selectedVehicle.id) : Promise.resolve(null);
    void result.then((schedule) => {
      if (!active) return;
      if (!schedule) { setError('That schedule is unavailable for this vehicle.'); return; }
      setCategory(schedule.category); setIntervalKm(schedule.interval_km === null ? '' : String(schedule.interval_km));
      setIntervalMonths(schedule.interval_months === null ? '' : String(schedule.interval_months));
      setBaselineOdometerKm(schedule.configured_odometer_km === null ? '' : String(schedule.configured_odometer_km));
      setBaselineDate(schedule.configured_date ?? '');
      setEnabled(schedule.enabled === 1);
      setReady(true);
    }).catch(() => { if (active) setError('That schedule could not be loaded.'); });
    return () => { active = false; };
  }, [database, scheduleId, selectedVehicle.id]);

  const onSave = async () => {
    if (!ready) return;
    const km = intervalKm.trim() ? Number(intervalKm) : null;
    const months = intervalMonths.trim() ? Number(intervalMonths) : null;
    const baseline = Number(baselineOdometerKm);
    if (!/^\d+$/.test(baselineOdometerKm.trim()) || !Number.isSafeInteger(baseline)) { setError('Enter a whole odometer reading for the schedule baseline.'); return; }
    setSaving(true); setError(null);
    try {
      await saveMaintenanceSchedule(database, { vehicleId: selectedVehicle.id, category: category.trim(), intervalKm: km, intervalMonths: months,
        baselineOdometerKm: baseline, baselineDate: baselineDate.trim() || null, enabled }, scheduleId);
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Schedule could not be saved.'); }
    finally { setSaving(false); }
  };

  if (!ready) return <Screen>{error ? <InlineMessage tone="error">{error}</InlineMessage> : <LoadingState label="Loading schedule…" />}<AppButton label="Cancel" onPress={() => router.back()} variant="secondary" /></Screen>;
  return <Screen>
    <PageHeading eyebrow={selectedVehicle.name} title={scheduleId ? 'Edit schedule' : 'Manage schedule'} subtitle="Choose your own service intervals. DriveSentry does not assume manufacturer intervals." />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    <Card>
      <TextField label="Service category" value={category} onChangeText={setCategory} maxLength={80} placeholder="e.g. Engine oil" />
      <TextField label="Repeat every (km, optional)" value={intervalKm} onChangeText={setIntervalKm} keyboardType="numeric" placeholder="5000" />
      <TextField label="Repeat every (months, optional)" value={intervalMonths} onChangeText={setIntervalMonths} keyboardType="numeric" placeholder="6" />
      <Text style={{ color: colors.muted, lineHeight: 20 }}>When both intervals are set, maintenance is due when either limit is reached.</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>Enter a known starting reading. This fallback is used when no completed service is linked. Upgraded schedules may need it entered again.</Text>
      <TextField label="Baseline odometer (km)" value={baselineOdometerKm} onChangeText={setBaselineOdometerKm} keyboardType="numeric" />
      <TextField label="Baseline date (YYYY-MM-DD, required for time intervals)" value={baselineDate} onChangeText={setBaselineDate} placeholder="2026-11-18" />
      <ChoiceField label="Schedule" value={enabled ? 'enabled' : 'disabled'} options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} onChange={(value) => setEnabled(value === 'enabled')} />
      <AppButton label={scheduleId ? 'Save schedule' : 'Add schedule'} onPress={() => void onSave()} loading={saving} />
      <AppButton label="Cancel" onPress={() => router.back()} variant="secondary" />
    </Card>
  </Screen>;
}
