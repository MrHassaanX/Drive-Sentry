import type { FuelType } from '../vehicles/types';

export type RecordedFuelType = Exclude<FuelType, 'electric'>;

export interface FuelEntry {
  id: number;
  vehicle_id: number;
  refuelled_at: string;
  odometer_km: number;
  quantity_milliunits: number;
  quantity_unit: 'litre' | 'kg';
  recorded_fuel_type: RecordedFuelType | null;
  cost_paise: number;
  is_full_tank: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface FuelEntryInput {
  vehicleId: number;
  refuelledAt: string;
  odometerKm: number;
  quantityMilliunits: number;
  quantityUnit: 'litre' | 'kg';
  costPaise: number;
  isFullTank: boolean;
}

export interface FuelEntryFormInput {
  date: string;
  time: string;
  odometerKm: string;
  quantityAmount: string;
  totalPaidRupees: string;
  fillType: string;
}

export type FuelEntryField = keyof FuelEntryFormInput;
export type FuelEntryFormErrors = Partial<Record<FuelEntryField, string>>;

export interface MileageSegment {
  startEntryId: number;
  endEntryId: number;
  startOdometerKm: number;
  endOdometerKm: number;
  distanceKm: number;
  quantityMilliunits: number;
  quantityUnit: 'litre' | 'kg';
  costPaise: number;
  efficiencyKmPerUnit: number;
  costPerKmRupees: number;
  startDate: string;
  endDate: string;
}

export interface FuelInsights {
  entries: FuelEntry[];
  monthSpendPaise: number;
  allTimeSpendPaise: number;
  latestMileage: MileageSegment | null;
  mileageSegments: MileageSegment[];
}
