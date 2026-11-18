import type { MaintenanceRecordInput, MaintenanceScheduleInput } from './types';

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export function validateMaintenanceRecord(input: MaintenanceRecordInput): string | null {
  if (!input.category.trim() || input.category.trim().length > 80) return 'Enter a service category up to 80 characters.';
  if (!isValidDateOnly(input.serviceDate)) return 'Enter a valid service date.';
  if (!Number.isSafeInteger(input.odometerKm) || input.odometerKm < 0) return 'Odometer must be a whole number of kilometres.';
  if (!Number.isSafeInteger(input.costPaise) || input.costPaise < 0) return 'Cost must be a non-negative amount.';
  if ((input.workshop?.length ?? 0) > 120) return 'Workshop name must be 120 characters or fewer.';
  if ((input.notes?.length ?? 0) > 2000) return 'Notes must be 2,000 characters or fewer.';
  return null;
}

export function validateMaintenanceSchedule(input: MaintenanceScheduleInput): string | null {
  if (!input.category.trim() || input.category.trim().length > 80) return 'Enter a schedule category up to 80 characters.';
  if (input.intervalKm === null && input.intervalMonths === null) return 'Set a distance interval, a time interval, or both.';
  if (input.intervalKm !== null && (!Number.isInteger(input.intervalKm) || input.intervalKm < 1 || input.intervalKm > 1_000_000)) return 'Distance interval must be 1–1,000,000 km.';
  if (input.intervalMonths !== null && (!Number.isInteger(input.intervalMonths) || input.intervalMonths < 1 || input.intervalMonths > 120)) return 'Time interval must be 1–120 months.';
  if (!Number.isSafeInteger(input.baselineOdometerKm) || input.baselineOdometerKm < 0) return 'Baseline odometer must be a non-negative whole number.';
  if (input.baselineDate !== null && !isValidDateOnly(input.baselineDate)) return 'Enter a valid baseline date.';
  return null;
}
