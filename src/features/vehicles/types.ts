export type VehicleType = 'car' | 'motorcycle';
export type FuelType = 'petrol' | 'diesel' | 'cng' | 'electric' | 'hybrid';

export interface Vehicle {
  id: number;
  name: string;
  manufacturer: string;
  model: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  registration_number: string | null;
  current_odometer_km: number;
  model_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleWriteInput {
  name: string;
  manufacturer: string;
  model: string;
  vehicleType: VehicleType;
  fuelType: FuelType;
  registrationNumber: string | null;
  currentOdometerKm: number;
  modelYear: number | null;
}

export interface VehicleFormInput {
  name: string;
  manufacturer: string;
  model: string;
  vehicleType: string;
  fuelType: string;
  registrationNumber: string;
  currentOdometerKm: string;
  modelYear: string;
}

export type VehicleField = keyof VehicleFormInput;
export type VehicleFormErrors = Partial<Record<VehicleField, string>>;
