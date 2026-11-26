import assert from 'node:assert/strict';
import test from 'node:test';
import { commitAttachment, verifiedExtension } from '../src/features/ownership/attachmentType.ts';
import { expiryStatus, parseIntervals, reminderDates, validDate } from '../src/features/ownership/dates.ts';
import { planReminders, reminderChanges } from '../src/features/ownership/reminderPlan.ts';
import { csvCell, escapeHtml, pdfReport } from '../src/features/ownership/report.ts';
import { dateRange, summarize, validateExpense } from '../src/features/ownership/spending.ts';

test('expiry works on calendar days and never schedules past reminders', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(expiryStatus('2026-11-24', '2026-11-26'), 'Expired');
  assert.equal(expiryStatus('2026-11-26', '2026-11-26'), 'Expiring soon');
  assert.equal(expiryStatus('2027-01-15', '2026-11-26'), 'Valid');
  assert.deepEqual(parseIntervals('0, 7, 30, 7'), [30, 7, 0]);
  assert.throws(() => parseIntervals('-1,7'), /365/);
  const now = new Date(2026, 10, 25, 12);
  const dates = reminderDates('2026-11-26', [30, 15, 7, 1, 0], now);
  assert.deepEqual(dates, [new Date(2026, 10, 26, 9)]);
  assert.deepEqual(reminderDates('2026-11-24', [0], now), []);
});

test('reminder reconciliation removes duplicates and stale schedules and caps pending alerts', () => {
  const now = new Date(2026, 10, 25, 8);
  const plan = planReminders([{ id: 1, expires_on: '2026-11-26' }], [1, 0], now);
  assert.equal(plan.length, 2);
  const result = reminderChanges(plan, [
    { id: 'keep', key: plan[0].key }, { id: 'duplicate', key: plan[0].key }, { id: 'obsolete', key: '99:100' },
  ]);
  assert.deepEqual(result, { cancel: ['duplicate', 'obsolete'], schedule: [plan[1]] });
  assert.equal(planReminders(Array.from({ length: 100 }, (_, id) => ({ id, expires_on: '2026-11-26' })), [0], now).length, 60);
  assert.deepEqual(reminderChanges([], [{ id: 'keep', key: plan[0].key }]).cancel, ['keep']);
});

test('an attachment save failure discards only the new copy and a copy failure skips the database', async () => {
  const discarded = [];
  const pdf = Uint8Array.from([37, 80, 68, 70, 45]);
  assert.equal(verifiedExtension('insurance.PDF', pdf), 'pdf');
  assert.throws(() => verifiedExtension('insurance.jpeg', pdf), /valid PDF/);
  await assert.rejects(commitAttachment(() => 'replacement.pdf', async () => { throw Error('SQLite refused update'); },
    name => discarded.push(name)), /SQLite refused/);
  await assert.rejects(commitAttachment(() => { throw Error('No space'); },
    async () => assert.fail('database called after copy failed'), name => discarded.push(name)), /No space/);
  assert.deepEqual(discarded, ['replacement.pdf']);
});

test('amount validation and range aggregation count recorded expenses once', () => {
  assert.equal(validateExpense({ date: '2026-11-26', category: 'Road tax', amount: '12.09', vendor: '', notes: '' }, '2026-11-26'), 1209);
  assert.throws(() => validateExpense({ date: '2026-11-27', category: 'Road tax', amount: '1', vendor: '', notes: '' }, '2026-11-26'), /through today/);
  assert.throws(() => dateRange('2026-11-30', '2026-11-01'), /range/);
  const date = '2026-11-26';
  const rows = [
    { date, kind: 'Fuel', paise: 5000, recorded: true },
    { date, kind: 'Service', paise: 1000, recorded: true },
    { date, kind: 'Service', paise: 10000, recorded: false },
    { date, kind: 'Other', category: 'Road tax', paise: 1250, recorded: true },
    { date: '2026-10-01', kind: 'Other', category: 'Insurance', paise: 1, recorded: true },
  ];
  const result = summarize(rows, [], '2026-11-01', '2026-11-30', date);
  assert.equal(result.total, 7250);
  assert.equal(result.allTime, 7251);
  assert.deepEqual(result.totals, [['Fuel', 5000], ['Service', 1000], ['Other', 1250]]);
  assert.equal(result.fuelCost, null);
  assert.equal(result.yearComparison, null);
  const complete = [2024, 2025].flatMap(year => Array.from({ length: 12 }, (_, month) => ({
    date: year + '-' + String(month + 1).padStart(2, '0') + '-01',
    kind: 'Other', category: 'Toll / FASTag', paise: year, recorded: true,
  })));
  assert.deepEqual(summarize(complete, [], '', '', date).yearComparison,
    { latest: 2025, current: 24300, previous: 24288 });
});

test('report escaping neutralizes spreadsheet formulas and markup', () => {
  assert.equal(csvCell(' =SUM(1,2)'), "\"' =SUM(1,2)\"");
  assert.equal(csvCell('a,"b"\nnext'), '"a,""b""\nnext"');
  assert.equal(escapeHtml('<img src="x" />'), '&lt;img src=&quot;x&quot; /&gt;');
  const html = pdfReport({ name: '<b>Tracker</b>', manufacturer: 'Triumph', model: '400' }, [
    { date: '2026-11-26', kind: 'Other', category: 'Road tax', paise: 25000, recorded: true },
    { date: '2026-11-25', kind: 'Other', category: 'Parking', paise: 50000, recorded: true },
  ], [], '2026-11-26', '2026-11-26', new Date(2026, 10, 26, 12));
  assert.ok(html.includes('&lt;b&gt;Tracker&lt;/b&gt;'));
  assert.match(html, /₹250\.00/);
  assert.doesNotMatch(html, /Parking|₹500\.00/);
});
