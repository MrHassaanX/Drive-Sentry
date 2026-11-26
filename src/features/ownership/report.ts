import { dateRange, summarize, type SpendingRow } from './spending.ts';
import { localDate } from './dates.ts';
import type { Vehicle } from '../vehicles/types.ts';
import type { FuelEntry } from '../fuel/types.ts';

const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export function csvCell(value: string | number | undefined) {
  const raw = String(value ?? '');
  const safe = typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csvReport(vehicle: Vehicle, rows: SpendingRow[], from: string, to: string) {
  const includes = dateRange(from, to);
  return [
    ['Vehicle', 'Date', 'Kind', 'Category', 'Amount (INR)', 'Status', 'Quantity', 'Unit', 'Odometer (km)', 'Notes'],
    ...rows.filter(row => includes(row.date)).map(row => [
      vehicle.name, row.date, row.kind, row.category, (row.paise / 100).toFixed(2), row.recorded ? 'Recorded' : 'Planned',
      row.quantity, row.unit, row.odometer, row.detail,
    ]),
  ].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function pdfReport(vehicle: Vehicle, rows: SpendingRow[], fuel: FuelEntry[], from: string, to: string, now = new Date()) {
  const metrics = summarize(rows, fuel, from, to, localDate(now));
  const breakdown = [...metrics.category].sort((a, b) => b[1] - a[1]);
  return `<!doctype html><html lang="en"><meta charset="UTF-8"><style>
  body{font:15px system-ui,sans-serif;color:#142130;margin:42px}h1{color:#087653;font-size:30px}h2{margin-top:28px}
  table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #dee3dc}
  .total{background:#ddf2ec;padding:15px}small{color:#515f68}
  </style><h1>DriveSentry Ownership Report</h1><h2>${escapeHtml(vehicle.name)}</h2>
  <p>${escapeHtml(vehicle.manufacturer + ' ' + vehicle.model)} · Generated ${localDate(now)}</p>
  <p>Reporting period · ${escapeHtml(from || 'Earliest record')} through ${escapeHtml(to || 'Latest record')}</p>
  <div class="total"><strong>Recorded spending · ${rupees(metrics.total)}</strong></div>
  <h2>Spending summary</h2><table><tr><th>Source</th><th>Amount</th></tr>${metrics.totals.map(([kind, amount]) => `<tr><td>${kind}</td><td>${rupees(amount)}</td></tr>`).join('')}</table>
  <p>${metrics.paid.filter(row => row.kind === 'Fuel').length} fuel entries · ${metrics.paid.filter(row => row.kind === 'Service').length} completed services</p>
  ${metrics.fuelCost === null ? '' : `<p>Recorded fuel cost · ${rupees(metrics.fuelCost)}/km over valid full-tank intervals</p>`}
  <h2>Category breakdown</h2><table><tr><th>Category</th><th>Amount</th></tr>${breakdown.map(([label, amount]) => `<tr><td>${escapeHtml(label)}</td><td>${rupees(amount)}</td></tr>`).join('')}</table>
  <p><small>Totals reflect entries saved for this vehicle and period. Planned service costs are excluded. Missing entries may understate spending.</small></p></html>`;
}
