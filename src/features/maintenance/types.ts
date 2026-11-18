export type MaintenanceCategory =
  | 'Engine oil'
  | 'Oil filter'
  | 'Air filter'
  | 'Brake inspection/service'
  | 'Tyres'
  | 'Battery'
  | 'Coolant'
  | 'General servicing'
  | 'Other';

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  schedule_id: number | null;
  category: string;
  service_date: string;
  odometer_km: number;
  cost_paise: number;
  workshop: string | null;
  notes: string | null;
  completed: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRecordInput {
  vehicleId: number;
  scheduleId: number | null;
  category: string;
  serviceDate: string;
  odometerKm: number;
  costPaise: number;
  workshop: string | null;
  notes: string | null;
  completed: boolean;
}

export interface MaintenanceSchedule {
  id: number;
  vehicle_id: number;
  category: string;
  interval_km: number | null;
  interval_months: number | null;
  baseline_odometer_km: number;
  baseline_date: string | null;
  enabled: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceScheduleInput {
  vehicleId: number;
  category: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  baselineOdometerKm: number;
  baselineDate: string | null;
  enabled: boolean;
}

export interface OdometerReading {
  date: string;
  odometerKm: number;
}

export type MaintenanceDueState = 'upcoming' | 'due-soon' | 'due-now' | 'overdue';

export interface MaintenanceStatus {
  schedule: MaintenanceSchedule;
  state: MaintenanceDueState;
  nextOdometerKm: number | null;
  nextDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  estimatedDueDate: string | null;
}
