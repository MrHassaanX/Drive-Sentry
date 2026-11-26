import type { FuelEntry } from '../fuel/types.ts';
import { calculateMileageSegments } from '../fuel/calculations.ts';
import { localDate, validDate } from './dates.ts';

export const expenseCategories = ['Insurance', 'Road tax', 'PUC', 'Toll / FASTag', 'Parking',
  'Washing / detailing', 'Unlogged repairs', 'Accessories', 'Registration fees', 'Other'];

export type Expense = { id: number; spent_on: string; category: string; cost_paise: number; vendor: string; notes: string };
export type SpendingRow = { date: string; kind: 'Fuel' | 'Service' | 'Other'; category: string; paise: number;
  recorded: boolean; detail: string; quantity?: number; unit?: string; odometer?: number };
export type ServiceSpend = { service_date: string; category: string; cost_paise: number; completed: number;
  odometer_km: number; notes: string | null; workshop: string | null };

export function validateExpense(input: { date: string; category: string; amount: string; vendor: string; notes: string }, today = localDate()) {
  if (!validDate(input.date) || input.date > today) throw Error('Enter a valid expense date through today.');
  if (!expenseCategories.includes(input.category)) throw Error('Choose an expense category.');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.amount.trim());
  if (!match) throw Error('Enter a non-negative INR amount with up to two decimal places.');
  if (input.vendor.trim().length > 120 || input.notes.trim().length > 1000) throw Error('Vendor or notes are too long.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function spendingRows(fuel: FuelEntry[], service: ServiceSpend[], expenses: Expense[]): SpendingRow[] {
  return [
    ...fuel.map((item): SpendingRow => ({
      date: localDate(new Date(item.refuelled_at)), kind: 'Fuel', category: item.recorded_fuel_type ?? 'Refill',
      paise: item.cost_paise, recorded: true, detail: item.is_full_tank ? 'Full tank' : 'Partial refill',
      quantity: item.quantity_milliunits / 1000, unit: item.quantity_unit, odometer: item.odometer_km,
    })),
    ...service.map((item): SpendingRow => ({
      date: item.service_date, kind: 'Service', category: item.category, paise: item.cost_paise,
      recorded: item.completed === 1, detail: [item.workshop, item.notes].filter(Boolean).join(' · '), odometer: item.odometer_km,
    })),
    ...expenses.map((item): SpendingRow => ({ date: item.spent_on, kind: 'Other', category: item.category,
      paise: item.cost_paise, recorded: true, detail: [item.vendor, item.notes].filter(Boolean).join(' · ') })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function dateRange(from: string, to: string) {
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) throw Error('Enter a valid reporting range.');
  return (day: string) => (!from || day >= from) && (!to || day <= to);
}
export const totalPaise = (rows: SpendingRow[]) => rows.reduce((sum, row) => sum + (row.recorded ? row.paise : 0), 0);

function compareRecordedYears(months: Map<string, number>, today: string) {
  const latest = Number(today.slice(0, 4)) - 1;
  const complete = (year: number) => Array.from({ length: 12 }, (_, month) =>
    months.get(year + '-' + String(month + 1).padStart(2, '0')));
  const current = complete(latest);
  const previous = complete(latest - 1);
  if ([...current, ...previous].some(value => value === undefined)) return null;
  const sum = (values: (number | undefined)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return { latest, current: sum(current), previous: sum(previous) };
}

export function summarize(rows: SpendingRow[], fuel: FuelEntry[], from = '', to = '', today = localDate()) {
  const includes = dateRange(from, to);
  const range = rows.filter(row => includes(row.date));
  const paid = range.filter(row => row.recorded);
  const month = new Map<string, number>();
  const category = new Map<string, number>();
  for (const row of paid) {
    const key = row.date.slice(0, 7);
    month.set(key, (month.get(key) ?? 0) + row.paise);
    const label = row.kind === 'Other' ? row.category : row.kind;
    category.set(label, (category.get(label) ?? 0) + row.paise);
  }
  const segments = calculateMileageSegments(fuel).filter(item => includes(localDate(new Date(item.startDate))) && includes(localDate(new Date(item.endDate))));
  const distance = segments.reduce((sum, item) => sum + item.distanceKm, 0);
  const segmentSpend = segments.reduce((sum, item) => sum + item.costPaise, 0);
  // To avoid implying continuous coverage, use ownership distance only for one valid interval.
  const interval = segments.at(-1);
  const ownership = interval && localDate(new Date(interval.startDate)) < localDate(new Date(interval.endDate))
    ? (interval.costPaise + totalPaise(paid.filter(row => row.kind !== 'Fuel' &&
      row.date > localDate(new Date(interval.startDate)) && row.date <= localDate(new Date(interval.endDate)))))
      / interval.distanceKm : null;
  return {
    range, paid, total: totalPaise(paid),
    totals: (['Fuel', 'Service', 'Other'] as const).map(kind => [kind, totalPaise(paid.filter(row => row.kind === kind))] as const),
    month, category,
    average: month.size ? totalPaise(paid) / month.size : null,
    currentMonth: totalPaise(rows.filter(row => row.date.startsWith(today.slice(0, 7)))),
    currentYear: totalPaise(rows.filter(row => row.date.startsWith(today.slice(0, 4)))),
    allTime: totalPaise(rows),
    fuelCost: distance ? segmentSpend / distance : null,
    ownership,
    yearComparison: compareRecordedYears(month, today),
  };
}
