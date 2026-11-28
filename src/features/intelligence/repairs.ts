import type { MaintenanceRecord } from '../maintenance/types.ts';
import { type Warranty, warrantyExpiry, warrantyStatus } from './warranties.ts';

export type InvoiceItem = { id: number; service_id: number; vehicle_id: number; description: string; quantity_text: string | null; cost_paise: number | null };
const components: [RegExp, string][] = [
  [/\b(?:vehicle |starter )?battery\b/, 'Battery'],
  [/\bbrake pads?\b/, 'Brake pads'], [/\bbrake (?:servicing|service)\b/, 'Brake service'],
  [/\b(?:tyres?|tires?)\b/, 'Tyres'], [/\bengine oil\b/, 'Engine oil'],
  [/\boil filters?\b/, 'Oil filter'], [/\bair filters?\b/, 'Air filter'],
  [/\bcoolant\b/, 'Coolant'], [/\bspark plugs?\b/, 'Spark plugs'],
  [/\bchain and sprocket\b/, 'Chain and sprocket'],
];
export function normalizeComponent(description: string) {
  const text = description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/\b(?:check(?:ed|ing)?|quote|recommended|inspect(?:ed|ion|ing)?|test(?:ed|ing)?|terminal cleaning|charger|fluid|pressure|rotation)\b/.test(text)) return null;
  const found = components.filter(([pattern]) => pattern.test(text));
  if (found.length !== 1) return null;
  const position = [...new Set(text.match(/\b(?:front|rear|left|right)\b/g) ?? [])].sort();
  if (position.includes('front') && position.includes('rear') || position.includes('left') && position.includes('right')) return null;
  return [found[0][1], ...position].join(' · ');
}
export type RepairRule = { max_days: number; max_km: number };
export const defaultRule: RepairRule = { max_days: 180, max_km: 3000 };

type PairedService = { component: string; previous: MaintenanceRecord; current: MaintenanceRecord; days: number; km: number };
export type RepairInsight = PairedService & { key: string; warranty?: Warranty };
export function repairInsights(vehicleId: number, records: MaintenanceRecord[], items: InvoiceItem[], warranties: Warranty[], rule: RepairRule, dismissed: string[]) {
  const history = records.filter(record => record.vehicle_id === vehicleId && record.completed === 1)
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || a.id - b.id);
  const pairs: PairedService[] = [];
  const last = new Map<string, MaintenanceRecord>();
  for (const current of history) {
    const parts = items.filter(item => item.vehicle_id === vehicleId && item.service_id === current.id)
      .map(item => normalizeComponent(item.description)).filter((name): name is string => name !== null);
    const category = normalizeComponent(current.category);
    const names = new Set(parts.length ? parts : category ? [category] : []);
    for (const component of names) {
      const previous = last.get(component);
      last.set(component, current);
      if (!previous) continue;
      const days = Math.round((Date.parse(current.service_date) - Date.parse(previous.service_date)) / 86_400_000);
      const km = current.odometer_km - previous.odometer_km;
      // Entries recorded on the same day at the same reading can be parts of one service.
      if (!Number.isFinite(days) || days < 0 || km < 0 || (days === 0 && km === 0)) continue;
      const routine = ['Engine oil', 'Oil filter', 'Air filter', 'Coolant'].includes(component);
      const dayLimit = routine ? Math.min(60, rule.max_days) : rule.max_days;
      const kmLimit = routine ? Math.min(1500, rule.max_km) : rule.max_km;
      if (days > dayLimit || km > kmLimit) continue;
      pairs.push({ component, previous, current, days, km });
    }
  }
  return pairs.reverse().flatMap((pair): RepairInsight[] => {
    const key = [pair.previous.id, pair.current.id, pair.component].join(':');
    if (dismissed.includes(key)) return [];
    const warranty = warranties.find(item => item.vehicle_id === vehicleId && normalizeComponent(item.component) === pair.component &&
      (item.service_id === pair.previous.id || (!!item.installed_on && item.installed_on <= pair.current.service_date)) &&
      (warrantyExpiry(item) !== null || item.limit_km !== null) &&
      ['Active', 'Expiring soon'].includes(warrantyStatus(item, pair.current.odometer_km, pair.current.service_date)));
    return [{ ...pair, key, warranty }];
  });
}
