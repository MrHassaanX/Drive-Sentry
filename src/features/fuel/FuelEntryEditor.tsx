import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, ChoiceField, InlineMessage, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import type { Vehicle } from '../vehicles/types';
import { useAppTheme } from '../../hooks/useAppTheme';
import { saveFuelEntry } from './service';
import type { FuelEntry, FuelEntryFormErrors, FuelEntryFormInput } from './types';
import { fuelEntryToForm, formatLocalDate, formatLocalTime, toFuelEntryInput, validateFuelEntryForm } from './validation';

function getCurrentForm(): FuelEntryFormInput {
  const now = new Date();
  return {
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    odometerKm: '',
    quantityAmount: '',
    totalPaidRupees: '',
    fillType: 'partial',
  };
}

export function FuelEntryEditor({ entry, associatedVehicle }: { entry?: FuelEntry; associatedVehicle?: Vehicle }) {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const { selectedVehicle } = useSelectedVehicle();
  const vehicle = entry ? associatedVehicle ?? null : selectedVehicle;
  const vehicleId = vehicle?.id ?? null;
  const quantityUnit = entry?.quantity_unit ?? (vehicle?.fuel_type === 'cng' ? 'kg' : 'litre');
  const [form, setForm] = useState<FuelEntryFormInput>(() => entry ? fuelEntryToForm(entry) : getCurrentForm());
  const [errors, setErrors] = useState<FuelEntryFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof FuelEntryFormInput>(field: K, value: FuelEntryFormInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  };

  const save = async () => {
    const nextErrors = validateFuelEntryForm(form, quantityUnit);
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length > 0) return;
    if (vehicleId === null) {
      setSaveError('Add or select a vehicle before recording a refill.');
      return;
    }

    setIsSaving(true);
    try {
      const input = toFuelEntryInput(form, vehicleId, quantityUnit);
      await saveFuelEntry(database, input, entry?.id ?? null);
      router.replace('/(tabs)/fuel');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The fuel record could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!vehicle) {
    return (
      <Screen>
        <PageHeading eyebrow="Fuel log" title="Add a refill" subtitle="Select a vehicle before recording fuel." />
        <Card>
          <Text style={[styles.help, { color: colors.muted }]}>Fuel records belong to an individual vehicle. Add a vehicle or choose one as active in My Vehicles.</Text>
          <AppButton label="Go to My Vehicles" onPress={() => router.replace('/(tabs)/vehicles')} />
        </Card>
      </Screen>
    );
  }

  if (vehicle.fuel_type === 'electric' && !entry) {
    return (
      <Screen>
        <PageHeading eyebrow="Fuel log" title="Charging logs aren’t available yet" subtitle="This milestone records liquid-fuel refills. Electric charging records are deferred." />
        <AppButton label="Back to Fuel" onPress={() => router.replace('/(tabs)/fuel')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeading
        eyebrow={entry ? 'Update record' : 'Fuel log'}
        title={entry ? 'Edit refill' : 'Record a refill'}
        subtitle={entry ? `Correct the refill details for ${vehicle.name}.` : `Recording for ${vehicle.name}.`}
      />
      {saveError ? <InlineMessage tone="error">{saveError}</InlineMessage> : null}
      <Card style={{ backgroundColor: colors.surfaceRaised }}>
        <Text style={[styles.infoTitle, { color: colors.text }]}>How mileage is calculated</Text>
        <Text style={[styles.help, { color: colors.muted }]}>Mileage is calculated only between consecutive full-tank refills. All partial refills and their quantities in between must be recorded for a useful result.</Text>
      </Card>
      {vehicle.fuel_type === 'electric' && entry ? <InlineMessage>This is a saved refill from before this vehicle was marked as electric. Charging records are not part of this milestone.</InlineMessage> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Date (YYYY-MM-DD)" placeholder="2026-11-18" value={form.date} onChangeText={(value) => updateField('date', value)} error={errors.date} autoCapitalize="none" />
          </View>
          <View style={styles.half}>
            <TextField label="Time (24-hour)" placeholder="09:30" value={form.time} onChangeText={(value) => updateField('time', value)} error={errors.time} autoCapitalize="none" />
          </View>
        </View>
        <TextField
          label="Odometer at refill (km)"
          placeholder="e.g. 25,430"
          keyboardType="number-pad"
          value={form.odometerKm}
          onChangeText={(value) => updateField('odometerKm', value.replace(/,/g, ''))}
          error={errors.odometerKm}
        />
        <TextField
          label={`Fuel quantity (${quantityUnit === 'kg' ? 'kg' : 'litres'})`}
          placeholder={quantityUnit === 'kg' ? 'e.g. 8.500' : 'e.g. 32.500'}
          keyboardType="decimal-pad"
          value={form.quantityAmount}
          onChangeText={(value) => updateField('quantityAmount', value)}
          error={errors.quantityAmount}
        />
        <TextField
          label="Total paid (₹)"
          placeholder="e.g. 3,200.00"
          keyboardType="decimal-pad"
          value={form.totalPaidRupees}
          onChangeText={(value) => updateField('totalPaidRupees', value.replace(/,/g, ''))}
          error={errors.totalPaidRupees}
        />
        <ChoiceField
          label="Tank filled completely?"
          value={form.fillType as 'full' | 'partial'}
          options={[{ value: 'partial', label: 'Partial refill' }, { value: 'full', label: 'Full tank' }]}
          onChange={(value) => updateField('fillType', value)}
        />
        <AppButton label={entry ? 'Save fuel changes' : 'Save refill'} onPress={() => void save()} loading={isSaving} />
        <AppButton label="Cancel" onPress={() => router.back()} variant="ghost" disabled={isSaving} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '800' },
  help: { fontSize: 13, lineHeight: 20 },
});
