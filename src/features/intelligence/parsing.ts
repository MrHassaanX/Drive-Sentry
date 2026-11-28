import { localDate, validDate } from '../ownership/dates.ts';

export type Candidate = { value: string; source: string };
export type ReceiptField = 'merchant' | 'date' | 'time' | 'fuel' | 'quantity' | 'rate' | 'total' |
  'reference' | 'registration' | 'odometer' | 'gst' | 'discount' | 'labour' | 'parts';
export type LineItem = { description: string; quantity: string; cost: string };
export type ParsedReceipt = { fields: Partial<Record<ReceiptField, Candidate[]>>; items: LineItem[]; kind: 'fuel' | 'service' | 'unknown' };

const negativeMoney = /[-−]\s*(?:₹|INR|Rs\.?)?\s*\d+(?:,+\s*\d+)*(?:\.\d{1,2})?\s*$/i;
const money = /(?<![\d.,])(?:₹|\bINR\b|\bRs\.?)?\s*(\d+(?:,+\s*\d+)*(?:\.\d{1,2})?)\s*$/i;
const integerGrouping = /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})$/;

function normalizeNumber(value: string | undefined) {
  const compact = value?.replace(/\s/g, '');
  return compact && integerGrouping.test(compact.split('.')[0]) ? compact.replaceAll(',', '') : undefined;
}
export function receiptDate(line: string, today = localDate()) {
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(line);
  const indian = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(line);
  const named = /\b(\d{1,2})[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+(\d{4}|\d{2})\b/i.exec(line);
  let parts: string[] | undefined;
  if (iso) parts = [iso[1], iso[2], iso[3]];
  else if (indian) parts = [indian[3], indian[2], indian[1]];
  else if (named) {
    const month = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(named[2].toLowerCase()) + 1;
    parts = [named[3], String(month), named[1]];
  }
  if (!parts) return undefined;
  const [year, month, day] = parts;
  const date = (year.length === 2 ? '20' + year : year) + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
  return validDate(date) && date <= today ? date : undefined;
}

export function parseReceipt(text: string, today = localDate()): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 180);
  const fields: ParsedReceipt['fields'] = {};
  const items: LineItem[] = [];
  const add = (key: ReceiptField, value: string | undefined, source: string) => {
    if (!value) return;
    const values = fields[key] ?? (fields[key] = []);
    if (values.length < 8 && !values.some(entry => entry.value.toLowerCase() === value.toLowerCase())) values.push({ value, source });
  };
  let fuelLines = 0;
  let serviceLines = 0;
  for (const [index, original] of lines.entries()) {
    const line = original.replace(/\s+/g, ' ');
    const printedAmount = negativeMoney.test(line) ? undefined : money.exec(line)?.[1];
    const amount = normalizeNumber(printedAmount);
    const date = receiptDate(line, today);
    if (date && !/\b(?:due|expiry|expir|valid till)\b/i.test(line)) add('date', date, original);
    const clock = /\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(am|pm)?\b/i.exec(line);
    if (clock) {
      const h = Number(clock[1]);
      const meridian = clock[3]?.toLowerCase();
      if (meridian ? h >= 1 && h <= 12 : h <= 23) {
        add('time', String(meridian ? h % 12 + (meridian === 'pm' ? 12 : 0) : h).padStart(2, '0') + ':' + clock[2], original);
      }
    }
    const fuel = /\b(petrol|diesel|cng)\b/gi;
    for (const match of line.matchAll(fuel)) { add('fuel', match[1].toLowerCase(), original); fuelLines++; }
    const quantity = /\b(\d{1,4}(?:\.\d{1,3})?)\s*(litres?|liters?|ltr\.?|l|kilograms?|kgs?)\b/gi;
    if (!/\b(?:rate|price|per)\b/i.test(line)) {
      for (const match of line.matchAll(quantity)) {
        add('quantity', match[1] + (/^k/i.test(match[2]) ? ' kg' : ' L'), original);
        fuelLines++;
      }
    }
    if (/\b(?:rate|unit price|price per)\b/i.test(line)) add('rate', amount, original);
    const isSummary = /\b(?:sub\s*total|taxable|cgst|sgst|igst|gst|tax|discount|change|balance|rate|unit price|cash tendered)\b/i.test(line)
      && !/\b(?:grand total|total payable|net payable|amount paid|total amount)\b/i.test(line);
    if (!isSummary && !/^total\s+(?:items?|quantity|litres?|kg|units?)\b/i.test(line) && /^(?:(?:grand|net|final)\s+)?(?:total(?: amount| paid| payable)?|amount(?: paid| payable)?|net payable)\s*(?:[:=\-]|\s|₹)/i.test(line)) {
      add('total', amount, original);
    }
    if (/\b(?:cgst|sgst|igst|gst|tax)\b/i.test(line)) add('gst', amount, original);
    if (/\bdiscount\b/i.test(line)) add('discount', amount, original);
    if (/\blabou?r\b/i.test(line)) { serviceLines++; add('labour', amount, original); }
    if (/\b(?:spare parts|parts total)\b/i.test(line)) { serviceLines++; add('parts', amount, original); }
    const ref = /\b(?:invoice|txn|transaction|receipt|bill|ref(?:erence)?)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,47})\b/i.exec(line);
    if (ref && /\d/.test(ref[1]) && !date) add('reference', ref[1], original);
    const reg = /\b([A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4})\b/.exec(line);
    if (reg) add('registration', reg[1].replace(/[ -]/g, ''), original);
    const odo = /\b(?:odometer|odo(?:meter)?\s*km|mileage|odo)\s*(?:reading)?\s*[:=-]?\s*(\d+(?:,\s*\d+)*)\b(?![\d,]|\.\d)/i.exec(line);
    add('odometer', normalizeNumber(odo?.[1]), original);
    if (index < 4 && /\b(?:petroleum|fuel station|service cent(?:re|er)|workshop|motors|automotive|automobiles|indianoil|hpcl|bpcl)\b/i.test(line)) {
      add('merchant', line.slice(0, 120), original);
    }
    if (items.length >= 30 || !printedAmount || !/[A-Za-z]/.test(line[0]) || /\b(?:total|sub\s*total|amount|paid|gst|tax|discount|round|invoice|receipt|date|balance|odometer|phone|mobile|ref|registration|rate|quantity|cash)\b/i.test(line)
      || /\b(?:petrol|diesel|cng)\b/i.test(line)) continue;
    const item = /^(.+?)(?:\s{2,}|\s+x\s+)(\d{1,5}(?:\.\d{1,3})?)\s+(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)$/i.exec(original);
    const withoutPrice = line.replace(money, '').replace(/[-: ]+$/, '');
    if (withoutPrice.length > 1) {
      items.push({ description: (item?.[1] ?? withoutPrice).slice(0, 160), quantity: item?.[2] ?? '', cost: amount ?? '' });
      serviceLines++;
    }
  }
  return { fields, items, kind: fuelLines > serviceLines && fuelLines > 0 ? 'fuel'
    : serviceLines > fuelLines && serviceLines > 0 ? 'service' : 'unknown' };
}

export function singleCandidate(parsed: ParsedReceipt, field: ReceiptField) {
  const hits = parsed.fields[field];
  return hits?.length === 1 ? hits[0].value : '';
}

export function likelyDuplicate(a: { vehicleId: number; fingerprint?: string | null; reference?: string | null; time: string; paise: number; quantity?: number },
  b: typeof a) {
  if (a.vehicleId !== b.vehicleId) return false;
  if (a.fingerprint && a.fingerprint === b.fingerprint) return true;
  if (a.reference && b.reference && a.reference.toLowerCase() === b.reference.toLowerCase() && a.time.slice(0, 10) === b.time.slice(0, 10)) return true;
  return a.time === b.time && a.paise === b.paise && a.quantity === b.quantity;
}
