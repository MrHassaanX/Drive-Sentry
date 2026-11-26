import { useCallback, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, Metric, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import { readOwnership, removeExpense, saveExpense } from './expenseRepository';
import { expenseCategories, spendingRows, summarize, type Expense } from './spending';
import { localDate } from './dates';
import { csvReport, pdfReport } from './report';
import { createReport, openPdf, shareReport } from './exports';
import { androidOwnershipPdf } from './androidPdf';

const newExpense = () => ({ date: localDate(), category: expenseCategories[0], amount: '', vendor: '', notes: '' });

export default function OwnershipScreen() {
  const db = useSQLiteContext();
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  const { vehicles, selectedVehicle } = useSelectedVehicle();
  const selected = vehicle ? vehicles.find(v => String(v.id) === vehicle) : selectedVehicle;
  const vehicleId = selected?.id;
  const { colors } = useAppTheme();
  const [loaded, setLoaded] = useState<{ id: number; data: Awaited<ReturnType<typeof readOwnership>> }>();
  const [editor, setEditor] = useState<{ id?: number; draft: ReturnType<typeof newExpense> }>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const data = loaded?.id === vehicleId ? loaded?.data : undefined;

  const refresh = useCallback(async () => {
    if (vehicleId !== undefined) setLoaded({ id: vehicleId, data: await readOwnership(db, vehicleId) });
  }, [db, vehicleId]);
  useFocusEffect(useCallback(() => {
    setEditor(undefined);
    void refresh().catch(() => setError('Could not load ownership records.'));
  }, [refresh]));

  const rows = data ? spendingRows(data.fuel, data.service, data.expenses) : [];
  let summary: ReturnType<typeof summarize> | undefined;
  if (data) {
    try { summary = summarize(rows, data.fuel, from, to); }
    catch { /* Keep editable date inputs visible. */ }
  }

  function edit(item?: Expense) {
    setError('');
    setEditor(item ? { id: item.id, draft: { date: item.spent_on, category: item.category,
      amount: (item.cost_paise / 100).toFixed(2), vendor: item.vendor, notes: item.notes } } : { draft: newExpense() });
  }
  async function perform(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try { await run(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation could not be completed.'); }
    finally { setBusy(false); }
  }
  function exportReport(format: 'pdf' | 'csv', preview = false) {
    if (!selected || !data || !summary) return;
    void perform(async () => {
      let content: string | Uint8Array;
      if (format === 'csv') content = csvReport(selected, rows, from, to);
      else if (Platform.OS === 'android') content = await androidOwnershipPdf(selected, rows, data.fuel, from, to);
      else content = pdfReport(selected, rows, data.fuel, from, to);
      const file = await createReport(content, format);
      if (preview) await openPdf(file);
      else await shareReport(file, format === 'pdf' ? 'application/pdf' : 'text/csv');
      setNotice('Report generated for ' + selected.name + '.');
    });
  }
  const field = (key: keyof ReturnType<typeof newExpense>, value: string) =>
    setEditor(current => current && { ...current, draft: { ...current.draft, [key]: value } });
  function chart(items: [string, number][]) {
    const max = Math.max(1, ...items.map(([, value]) => value));
    return items.map(([label, value]) => <View key={label} style={{ gap: 4 }}>
      <Text style={{ color: colors.text }}>{label} · {formatRupees(value)}</Text>
      <View style={{ backgroundColor: colors.surfaceRaised, height: 7, borderRadius: 6 }}>
        <View style={{ backgroundColor: colors.accent, width: `${value / max * 100}%`, height: 7, borderRadius: 6 }} />
      </View>
    </View>);
  }
  return <Screen>
    <AppButton label="Back" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <PageHeading title="Ownership Analytics" subtitle={selected?.name ?? 'Select a vehicle to review its ownership costs.'} />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    {notice ? <InlineMessage>{notice}</InlineMessage> : null}
    {!selected ? <AppButton label="My Vehicles" onPress={() => router.push('/(tabs)/vehicles')} /> :
      !data ? <LoadingState label="Loading ownership records…" /> : <>
      <Card>
        <ChoiceField label="Vehicle" value={String(selected.id)} options={vehicles.map(v => ({ value: String(v.id), label: v.name }))}
          onChange={id => router.setParams({ vehicle: id })} />
        <TextField label="From (YYYY-MM-DD, optional)" value={from} onChangeText={setFrom} />
        <TextField label="Through (YYYY-MM-DD, optional)" value={to} onChangeText={setTo} />
        <Text style={{ color: colors.muted }}>Totals reflect saved entries. Planned services and unrecorded costs are excluded.</Text>
      </Card>
      {!summary ? <InlineMessage tone="error">Check the reporting dates.</InlineMessage> : <>
        <Card>
          <Metric label="RECORDED SPENDING IN RANGE" value={formatRupees(summary.total)} />
          <Text style={{ color: colors.muted }}>{summary.paid.length} {summary.paid.length === 1 ? 'recorded entry' : 'recorded entries'} · {summary.paid.length ? 'Partial histories may understate spending.' : 'No spending records for this range.'}</Text>
          <Text style={{ color: colors.text }}>This month {formatRupees(summary.currentMonth)} · This year {formatRupees(summary.currentYear)}</Text>
          <Text style={{ color: colors.text }}>All time {formatRupees(summary.allTime)}</Text>
          {summary.average !== null && <Text style={{ color: colors.text }}>Average per month with records {formatRupees(Math.round(summary.average))}</Text>}
          {summary.fuelCost !== null && <Text style={{ color: colors.text }}>Recorded fuel cost {formatRupees(Math.round(summary.fuelCost))}/km over valid full-tank intervals</Text>}
          {summary.ownership !== null && <Text style={{ color: colors.text }}>Estimated ownership cost {formatRupees(Math.round(summary.ownership))}/km for the latest valid full-tank interval</Text>}
          {summary.yearComparison && <Text style={{ color: colors.text }}>
            {summary.yearComparison.latest} recorded {formatRupees(summary.yearComparison.current)} · {summary.yearComparison.latest - 1} recorded {formatRupees(summary.yearComparison.previous)}
          </Text>}
        </Card>
        <Card><Text style={{ color: colors.text, fontWeight: '800' }}>Fuel, service and other expenses</Text>{chart(summary.totals.map(pair => [...pair]))}</Card>
        {summary.month.size > 0 && <Card><Text style={{ color: colors.text, fontWeight: '800' }}>Monthly spending · latest 12 recorded months</Text>{chart([...summary.month].slice(-12))}</Card>}
        {summary.category.size > 0 && <Card><Text style={{ color: colors.text, fontWeight: '800' }}>Category breakdown</Text>{chart([...summary.category].sort((a, b) => b[1] - a[1]))}</Card>}
        <Card>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Ownership reports · selected date range</Text>
          <AppButton label="Export CSV" variant="secondary" disabled={busy} onPress={() => exportReport('csv')} />
          <AppButton label="Generate and open PDF" variant="secondary" disabled={busy} onPress={() => exportReport('pdf', true)} />
          <AppButton label="Share or save PDF" variant="secondary" disabled={busy} onPress={() => exportReport('pdf')} />
        </Card>
      </>}
      <PageHeading title="Additional expenses" subtitle="Record costs that aren’t already in Fuel or Maintenance." />
      {!editor ? <AppButton label="Add expense" disabled={busy} onPress={() => edit()} /> : <Card>
        <ChoiceField label="Category" value={editor.draft.category} options={expenseCategories.map(value => ({ value, label: value }))} onChange={v => field('category', v)} />
        <TextField label="Date (YYYY-MM-DD)" value={editor.draft.date} onChangeText={v => field('date', v)} />
        <TextField label="Amount (₹)" keyboardType="decimal-pad" value={editor.draft.amount} onChangeText={v => field('amount', v)} />
        <TextField label="Vendor (optional)" value={editor.draft.vendor} onChangeText={v => field('vendor', v)} maxLength={120} />
        <TextField label="Notes (optional)" value={editor.draft.notes} onChangeText={v => field('notes', v)} maxLength={1000} />
        <AppButton label="Save expense" loading={busy} onPress={() => void perform(async () => {
          await saveExpense(db, selected.id, editor.draft, editor.id);
          setEditor(undefined);
          await refresh();
        })} />
        <AppButton label="Cancel" variant="ghost" disabled={busy} onPress={() => setEditor(undefined)} />
      </Card>}
      {!data.expenses.length && <InlineMessage>No additional expenses for this vehicle.</InlineMessage>}
      {data.expenses.map(item => <Card key={item.id}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>{item.category} · {formatRupees(item.cost_paise)}</Text>
        <Text style={{ color: colors.muted }}>{item.spent_on}{item.vendor ? ' · ' + item.vendor : ''}</Text>
        {item.notes ? <Text style={{ color: colors.text }}>{item.notes}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <AppButton label="Edit expense" variant="ghost" disabled={busy} onPress={() => edit(item)} />
          <AppButton label="Delete expense" variant="danger" disabled={busy} onPress={() => Alert.alert('Delete expense?', 'This removes this entry from the vehicle’s ledger.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void perform(async () => {
              await removeExpense(db, selected.id, item.id);
              if (editor?.id === item.id) setEditor(undefined);
              await refresh();
            }) },
          ])} />
        </View>
      </Card>)}
    </>}
  </Screen>;
}
