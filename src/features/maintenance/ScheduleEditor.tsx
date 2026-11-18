import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, ChoiceField, InlineMessage, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getMaintenanceSchedule, saveMaintenanceSchedule } from './repository';
import { getLocalDateOnly } from './calculations';

export function ScheduleEditor() {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const { selectedVehicle } = useSelectedVehicle();
  const params = useLocalSearchParams<{ id?: string }>();
  const scheduleId = params.id ? Number(params.id) : undefined;
  const [category, setCategory] = useState('Engine oil');
  const [intervalKm, setIntervalKm] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [baselineOdometerKm, setBaselineOdometerKm] = useState(String(selectedVehicle?.current_odometer_km ?? '0'));
  const [baselineDate, setBaselineDate] = useState(getLocalDateOnly());
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scheduleId || !selectedVehicle) return;
    void getMaintenanceSchedule(database, scheduleId).then((schedule) => {
      if (!schedule || schedule.vehicle_id !== selectedVehicle.id) { setError('That schedule is unavailable.'); return; }
      setCategory(schedule.category); setIntervalKm(schedule.interval_km === null ? '' : String(schedule.interval_km));
      setIntervalMonths(schedule.interval_months === null ? '' : String(schedule.interval_months));
      setBaselineOdometerKm(String(schedule.baseline_odometer_km)); setBaselineDate(schedule.baseline_date ?? ''); setEnabled(schedule.enabled === 1);
    }).catch(() => setError('That schedule could not be loaded.'));
  }, [database, scheduleId, selectedVehicle]);

  const onSave = async () => {
    if (!selectedVehicle) return;
    const km = intervalKm.trim() ? Number(intervalKm) : null;
    const months = intervalMonths.trim() ? Number(intervalMonths) : null;
    const baseline = Number(baselineOdometerKm);
    if ((km !== null && !Number.isInteger(km)) || (months !== null && !Number.isInteger(months)) || !Number.isInteger(baseline)) { setError('Intervals and odometer must be whole numbers.'); return; }
    setSaving(true); setError(null);
    try {
      await saveMaintenanceSchedule(database, { vehicleId: selectedVehicle.id, category: category.trim(), intervalKm: km, intervalMonths: months,
        baselineOdometerKm: baseline, baselineDate: baselineDate.trim() || null, enabled }, scheduleId);
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Schedule could not be saved.'); }
    finally { setSaving(false); }
  };

  if (!selectedVehicle) return <Screen><PageHeading title="Maintenance schedule" /><Card><Text style={{ color: colors.text }}>Select a vehicle first.</Text></Card></Screen>;
  return <Screen>
    <PageHeading eyebrow={selectedVehicle.name} title={scheduleId ? 'Edit schedule' : 'Manage schedule'} subtitle="Choose your own service intervals. DriveSentry does not assume manufacturer intervals." />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    <Card>
      <TextField label="Service category" value={category} onChangeText={setCategory} maxLength={80} placeholder="e.g. Engine oil" />
      <TextField label="Repeat every (km, optional)" value={intervalKm} onChangeText={setIntervalKm} keyboardType="numeric" placeholder="5000" />
      <TextField label="Repeat every (months, optional)" value={intervalMonths} onChangeText={setIntervalMonths} keyboardType="numeric" placeholder="6" />
      <Text style={{ color: colors.muted, lineHeight: 20 }}>When both intervals are set, maintenance is due when either limit is reached.</Text>
      <TextField label="Last service odometer (km)" value={baselineOdometerKm} onChangeText={setBaselineOdometerKm} keyboardType="numeric" />
      <TextField label="Last service date (YYYY-MM-DD, optional)" value={baselineDate} onChangeText={setBaselineDate} placeholder="2026-11-18" />
      <ChoiceField label="Schedule" value={enabled ? 'enabled' : 'disabled'} options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} onChange={(value) => setEnabled(value === 'enabled')} />
      <AppButton label={scheduleId ? 'Save schedule' : 'Add schedule'} onPress={() => void onSave()} loading={saving} />
      <AppButton label="Cancel" onPress={() => router.back()} variant="secondary" />
    </Card>
  </Screen>;
}
