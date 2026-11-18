import type {
  FuelType,
  VehicleFormErrors,
  VehicleFormInput,
  VehicleType,
  VehicleWriteInput,
} from './types.ts';

const vehicleTypes: VehicleType[] = ['car', 'motorcycle'];
const fuelTypes: FuelType[] = ['petrol', 'diesel', 'cng', 'electric', 'hybrid'];

export function normalizeRegistrationNumber(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  return normalized.length > 0 ? normalized : null;
}

export function validateVehicleForm(input: VehicleFormInput): VehicleFormErrors {
  const errors: VehicleFormErrors = {};

  if (input.name.trim().length === 0) errors.name = 'Enter a vehicle name.';
  if (input.manufacturer.trim().length === 0) errors.manufacturer = 'Enter a manufacturer.';
  if (input.model.trim().length === 0) errors.model = 'Enter a model.';
  if (!vehicleTypes.includes(input.vehicleType as VehicleType)) errors.vehicleType = 'Choose a vehicle type.';
  if (!fuelTypes.includes(input.fuelType as FuelType)) errors.fuelType = 'Choose a fuel type.';

  const odometer = Number(input.currentOdometerKm);
  if (input.currentOdometerKm.trim().length === 0 || !Number.isSafeInteger(odometer) || odometer < 0) {
    errors.currentOdometerKm = 'Enter a whole odometer reading of 0 km or more.';
  }

  if (input.modelYear.trim().length > 0) {
    const year = Number(input.modelYear);
    if (!Number.isInteger(year) || year < 1886 || year > new Date().getFullYear() + 1) {
      errors.modelYear = 'Enter a valid model year.';
    }
  }

  const registration = normalizeRegistrationNumber(input.registrationNumber);
  if (registration && registration.length > 20) {
    errors.registrationNumber = 'Registration number must be 20 characters or fewer.';
  }

  return errors;
}

export function toVehicleWriteInput(input: VehicleFormInput): VehicleWriteInput {
  return {
    name: input.name.trim(),
    manufacturer: input.manufacturer.trim(),
    model: input.model.trim(),
    vehicleType: input.vehicleType as VehicleType,
    fuelType: input.fuelType as FuelType,
    registrationNumber: normalizeRegistrationNumber(input.registrationNumber),
    currentOdometerKm: Number(input.currentOdometerKm),
    modelYear: input.modelYear.trim().length > 0 ? Number(input.modelYear) : null,
  };
}
