import type { MaintenanceDueState, MaintenanceSchedule, MaintenanceStatus, OdometerReading } from './types';

export const DUE_SOON_KM = 500;
export const DUE_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export function getLocalDateOnly(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return date;
}

function dateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addCalendarMonths(dateValue: string, months: number): string | null {
  const date = parseDateOnly(dateValue);
  if (!date || !Number.isInteger(months) || months < 1) return null;
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return dateOnly(new Date(Date.UTC(targetYear, month, Math.min(date.getUTCDate(), lastDay))));
}

export function estimateDailyDistance(readings: OdometerReading[]): number | null {
  const sorted = readings
    .filter((reading) => Number.isFinite(reading.odometerKm) && reading.odometerKm >= 0 && parseDateOnly(reading.date) !== null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.some((reading, index) => index > 0 && reading.odometerKm < sorted[index - 1].odometerKm)) return null;
  const elapsedDays = (parseDateOnly(last.date)!.getTime() - parseDateOnly(first.date)!.getTime()) / DAY_MS;
  if (elapsedDays <= 0 || last.odometerKm <= first.odometerKm) return null;
  return (last.odometerKm - first.odometerKm) / elapsedDays;
}

export function resolveMaintenanceOdometer(profileOdometerKm: number, fuelOdometerReadings: number[]): number {
  return Math.max(0, profileOdometerKm, ...fuelOdometerReadings.filter((value) => Number.isFinite(value) && value >= 0));
}

export function calculateMaintenanceStatus(
  schedule: MaintenanceSchedule,
  currentOdometerKm: number,
  currentDate: string,
  history: OdometerReading[] = [],
): MaintenanceStatus {
  const baselineDate = parseDateOnly(schedule.baseline_date);
  const today = parseDateOnly(currentDate);
  const nextOdometerKm = schedule.interval_km === null ? null : schedule.baseline_odometer_km + schedule.interval_km;
  const nextDate = schedule.interval_months !== null && schedule.baseline_date
    ? addCalendarMonths(schedule.baseline_date, schedule.interval_months)
    : null;
  const remainingKm = nextOdometerKm === null ? null : nextOdometerKm - currentOdometerKm;
  const remainingDays = nextDate && today ? Math.floor((parseDateOnly(nextDate)!.getTime() - today.getTime()) / DAY_MS) : null;

  let state: MaintenanceDueState = 'upcoming';
  const hasKm = remainingKm !== null;
  const hasDate = remainingDays !== null;
  const kmExpired = hasKm && remainingKm! < 0;
  const dateExpired = hasDate && remainingDays! < 0;
  const kmReached = hasKm && remainingKm === 0;
  const dateReached = hasDate && remainingDays === 0;
  if (kmExpired || dateExpired) state = 'overdue';
  else if (kmReached || dateReached) state = 'due-now';
  else if ((hasKm && remainingKm! <= DUE_SOON_KM) || (hasDate && remainingDays! <= DUE_SOON_DAYS)) state = 'due-soon';

  const dailyDistance = estimateDailyDistance(history);
  const estimatedDueDate = remainingKm !== null && remainingKm > 0 && dailyDistance !== null && today !== null
    ? dateOnly(new Date(today.getTime() + Math.ceil(remainingKm / dailyDistance) * DAY_MS))
    : null;

  // Invalid or absent baselines do not create calendar deadlines.
  if (!baselineDate && schedule.interval_months !== null) return { schedule, state: nextOdometerKm === null ? 'upcoming' : state, nextOdometerKm, nextDate: null, remainingKm, remainingDays: null, estimatedDueDate };
  return { schedule, state, nextOdometerKm, nextDate, remainingKm, remainingDays, estimatedDueDate };
}

export function isDueState(state: MaintenanceDueState): boolean {
  return state === 'due-now' || state === 'overdue';
}
