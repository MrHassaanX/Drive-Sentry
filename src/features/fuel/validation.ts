import type { FuelEntryFormErrors, FuelEntryFormInput, FuelEntryInput } from './types';

const fullDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidCalendarDate(value: string): boolean {
  const match = fullDatePattern.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  return date.getUTCFullYear() === Number(yearText)
    && date.getUTCMonth() === Number(monthText) - 1
    && date.getUTCDate() === Number(dayText);
}

export function validateFuelEntryForm(
  input: FuelEntryFormInput,
  quantityUnit: 'litre' | 'kg',
  now: Date = new Date(),
): FuelEntryFormErrors {
  const errors: FuelEntryFormErrors = {};
  const date = input.date.trim();
  const time = input.time.trim();

  if (!isValidCalendarDate(date)) errors.date = 'Enter a real date in YYYY-MM-DD format.';
  if (!timePattern.test(time)) errors.time = 'Enter a time in 24-hour HH:MM format.';
  if (isValidCalendarDate(date) && timePattern.test(time)) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const selected = new Date(year, month - 1, day, hour, minute);
    if (selected.getTime() > now.getTime()) errors.date = 'Refuelling date and time cannot be in the future.';
  }

  const odometer = Number(input.odometerKm);
  if (input.odometerKm.trim().length === 0 || !Number.isSafeInteger(odometer) || odometer < 0) {
    errors.odometerKm = 'Enter a whole odometer reading of 0 km or more.';
  }

  const quantity = input.quantityAmount.trim();
  if (!/^(?:\d{1,3}|1000)(?:\.\d{1,3})?$/.test(quantity)) {
    errors.quantityAmount = `Enter fuel quantity in ${quantityUnit === 'kg' ? 'kg' : 'litres'}, up to 3 decimal places.`;
  } else {
    const milliunits = Math.round(Number(quantity) * 1000);
    if (!Number.isSafeInteger(milliunits) || milliunits < 1 || milliunits > 1_000_000) {
      errors.quantityAmount = `Fuel quantity must be greater than 0 and no more than 1,000 ${quantityUnit === 'kg' ? 'kg' : 'litres'}.`;
    }
  }

  const amount = input.totalPaidRupees.trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)) {
    errors.totalPaidRupees = 'Enter an amount in rupees, up to 2 decimal places.';
  } else if (!Number.isSafeInteger(Math.round(Number(amount) * 100))) {
    errors.totalPaidRupees = 'Enter a valid amount.';
  }

  if (input.fillType !== 'full' && input.fillType !== 'partial') {
    errors.fillType = 'Choose whether the tank was filled completely.';
  }

  return errors;
}

export function toFuelEntryInput(
  input: FuelEntryFormInput,
  vehicleId: number,
  quantityUnit: 'litre' | 'kg',
): FuelEntryInput {
  const [year, month, day] = input.date.split('-').map(Number);
  const [hour, minute] = input.time.split(':').map(Number);
  const refuelledAt = new Date(year, month - 1, day, hour, minute).toISOString();
  return {
    vehicleId,
    refuelledAt,
    odometerKm: Number(input.odometerKm),
    quantityMilliunits: Math.round(Number(input.quantityAmount) * 1000),
    quantityUnit,
    costPaise: Math.round(Number(input.totalPaidRupees) * 100),
    isFullTank: input.fillType === 'full',
  };
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

export function fuelEntryToForm(entry: {
  refuelled_at: string;
  odometer_km: number;
  quantity_milliunits: number;
  quantity_unit: 'litre' | 'kg';
  cost_paise: number;
  is_full_tank: 0 | 1;
}): FuelEntryFormInput {
  const date = new Date(entry.refuelled_at);
  return {
    date: formatLocalDate(date),
    time: formatLocalTime(date),
    odometerKm: String(entry.odometer_km),
    quantityAmount: (entry.quantity_milliunits / 1000).toFixed(3).replace(/\.?0+$/, ''),
    totalPaidRupees: (entry.cost_paise / 100).toFixed(2),
    fillType: entry.is_full_tank ? 'full' : 'partial',
  };
}
