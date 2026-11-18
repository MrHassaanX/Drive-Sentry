import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, ChoiceField, InlineMessage, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import type { Vehicle, VehicleFormErrors, VehicleFormInput } from './types';
import { createVehicle, updateVehicle } from './repository';
import { toVehicleWriteInput, validateVehicleForm } from './validation';

const emptyForm: VehicleFormInput = {
  name: '', manufacturer: '', model: '', vehicleType: 'car', fuelType: 'petrol',
  registrationNumber: '', currentOdometerKm: '0', modelYear: '',
};

function vehicleToForm(vehicle: Vehicle): VehicleFormInput {
  return {
    name: vehicle.name,
    manufacturer: vehicle.manufacturer,
    model: vehicle.model,
    vehicleType: vehicle.vehicle_type,
    fuelType: vehicle.fuel_type,
    registrationNumber: vehicle.registration_number ?? '',
    currentOdometerKm: String(vehicle.current_odometer_km),
    modelYear: vehicle.model_year ? String(vehicle.model_year) : '',
  };
}

export function VehicleEditor({ vehicle }: { vehicle?: Vehicle }) {
  const database = useSQLiteContext();
  const { refresh, selectVehicle } = useSelectedVehicle();
  const [form, setForm] = useState<VehicleFormInput>(vehicle ? vehicleToForm(vehicle) : emptyForm);
  const [errors, setErrors] = useState<VehicleFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof VehicleFormInput>(field: K, value: VehicleFormInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = async () => {
    const nextErrors = validateVehicleForm(form);
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    try {
      const input = toVehicleWriteInput(form);
      const id = vehicle
        ? (await updateVehicle(database, vehicle.id, input), vehicle.id)
        : await createVehicle(database, input);
      await refresh();
      if (!vehicle) await selectVehicle(id);
      router.replace(`/vehicles/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setSaveError(
        message.includes('vehicles.registration_number')
          ? 'That registration number is already saved for another vehicle.'
          : 'The vehicle could not be saved. Check your details and try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeading
        eyebrow={vehicle ? 'Vehicle profile' : 'Your garage'}
        title={vehicle ? 'Edit vehicle' : 'Add a vehicle'}
        subtitle={vehicle ? 'Keep the details for this vehicle up to date.' : 'Add the essentials to start building your vehicle history.'}
      />
      {saveError ? <InlineMessage tone="error">{saveError}</InlineMessage> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
        <TextField label="Vehicle name" placeholder="e.g. Family car" value={form.name} onChangeText={(value) => updateField('name', value)} error={errors.name} returnKeyType="next" />
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Manufacturer" placeholder="e.g. Maruti Suzuki" value={form.manufacturer} onChangeText={(value) => updateField('manufacturer', value)} error={errors.manufacturer} returnKeyType="next" />
          </View>
          <View style={styles.half}>
            <TextField label="Model" placeholder="e.g. Swift" value={form.model} onChangeText={(value) => updateField('model', value)} error={errors.model} returnKeyType="next" />
          </View>
        </View>
        <ChoiceField
          label="Vehicle type"
          value={form.vehicleType as 'car' | 'motorcycle'}
          options={[{ value: 'car', label: 'Car' }, { value: 'motorcycle', label: 'Motorcycle' }]}
          onChange={(value) => updateField('vehicleType', value)}
        />
        <ChoiceField
          label="Fuel type"
          value={form.fuelType as 'petrol' | 'diesel' | 'cng' | 'electric' | 'hybrid'}
          options={[
            { value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' },
            { value: 'cng', label: 'CNG' }, { value: 'electric', label: 'Electric' }, { value: 'hybrid', label: 'Hybrid' },
          ]}
          onChange={(value) => updateField('fuelType', value)}
        />
        <TextField
          label="Profile odometer (km)"
          placeholder="0"
          keyboardType="number-pad"
          value={form.currentOdometerKm}
          onChangeText={(value) => updateField('currentOdometerKm', value)}
          error={errors.currentOdometerKm}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField
              label="Registration number (optional)"
              placeholder="e.g. MH12AB1234"
              autoCapitalize="characters"
              value={form.registrationNumber}
              onChangeText={(value) => updateField('registrationNumber', value)}
              error={errors.registrationNumber}
            />
          </View>
          <View style={styles.half}>
            <TextField
              label="Model year (optional)"
              placeholder="e.g. 2022"
              keyboardType="number-pad"
              value={form.modelYear}
              onChangeText={(value) => updateField('modelYear', value)}
              error={errors.modelYear}
            />
          </View>
        </View>
        <AppButton label={vehicle ? 'Save changes' : 'Add to my garage'} onPress={() => void save()} loading={isSaving} />
        <AppButton label="Cancel" onPress={() => router.back()} variant="ghost" disabled={isSaving} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
