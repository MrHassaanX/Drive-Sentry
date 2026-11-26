export function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function expiryStatus(expiry: string | null, today = localDate()) {
  if (!expiry) return 'No expiry';
  const days = Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000);
  return days < 0 ? 'Expired' : days <= 30 ? 'Expiring soon' : 'Valid';
}

export const defaultIntervals = [30, 15, 7, 1, 0];
export function parseIntervals(text: string) {
  const values = text.split(',').map(value => value.trim());
  if (values.length > 10 || values.some(value => !/^\d{1,3}$/.test(value) || Number(value) > 365)) {
    throw new Error('Enter up to ten comma-separated days from 0 through 365.');
  }
  return [...new Set(values.map(Number))].sort((a, b) => b - a);
}

export function reminderDates(expiry: string | null, offsets: number[], now: Date) {
  if (!expiry || !validDate(expiry) || expiry < localDate(now)) return [];
  const [year, month, day] = expiry.split('-').map(Number);
  return offsets.map(offset => new Date(year, month - 1, day - offset, 9))
    .filter(date => +date > +now);
}
