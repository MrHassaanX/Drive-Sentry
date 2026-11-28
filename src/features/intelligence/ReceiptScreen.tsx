import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { toFuelEntryInput, validateFuelEntryForm } from '../fuel/validation';
import { parseServiceCostPaise, validateMaintenanceRecord } from '../maintenance/validation';
import { listMaintenanceSchedules } from '../maintenance/repository';
import type { MaintenanceRecord, MaintenanceSchedule } from '../maintenance/types';
import { commitAttachment } from '../ownership/attachmentType';
import { discardAttachment, persistAttachment } from '../ownership/files';
import { chooseReceipt, nativeOcrAvailable, recognizeReceipt, validateReceiptImage } from './ocr';
import { parseReceipt, singleCandidate, type LineItem, type ParsedReceipt, type ReceiptField } from './parsing';
import { DuplicateReceiptError, readServiceIntelligence, saveReviewedReceipt, type ReviewInput } from './receiptRepository';
import { receiptTransaction } from './transaction';

type Asset = NonNullable<Awaited<ReturnType<typeof chooseReceipt>>>;
type Draft = Partial<Record<ReceiptField | 'category' | 'fill', string>>;
const emptyItem: LineItem = { description: '', quantity: '', cost: '' };

export default function ReceiptScreen() {
  const { kind: param } = useLocalSearchParams<{ kind?: 'fuel' | 'service' }>();
  const kind = param === 'service' ? 'service' : 'fuel';
  const db = useSQLiteContext();
  const { vehicles, selectVehicle } = useSelectedVehicle();
  const { colors } = useAppTheme();
  const [vehicleId, setVehicleId] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [items, setItems] = useState<LineItem[]>([]);
  const [asset, setAsset] = useState<Asset>();
  const [parsed, setParsed] = useState<ParsedReceipt>();
  const [printedUnit, setPrintedUnit] = useState('');
  const [raw, setRaw] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [editing, setEditing] = useState('');
  const [service, setService] = useState<{ vehicle: string; schedules: MaintenanceSchedule[]; records: MaintenanceRecord[]; items: Awaited<ReturnType<typeof readServiceIntelligence>>['items'] }>();
  const locked = useRef(false);
  const vehicle = vehicles.find(item => String(item.id) === vehicleId);
  const unit = vehicle?.fuel_type === 'cng' ? 'kg' : 'litre';
  const serviceData = service && service.vehicle === vehicleId ? service : undefined;

  useEffect(() => {
    if (kind !== 'service' || !vehicleId) return;
    let active = true;
    void Promise.all([listMaintenanceSchedules(db, Number(vehicleId)), readServiceIntelligence(db, Number(vehicleId))])
      .then(([schedules, { records, items }]) => { if (active) setService({ vehicle: vehicleId, schedules, records, items }); })
      .catch(() => { if (active) setError('Could not load the service history for this vehicle.'); });
    return () => { active = false; };
  }, [db, kind, vehicleId]);

  function invalidate() { setConfirmed(false); setDuplicate(false); setError(''); }
  function update(key: keyof Draft, value: string) { setDraft(current => ({ ...current, [key]: value })); invalidate(); }
  function editItem(index: number, key: keyof LineItem, value: string) {
    setItems(current => current.map((item, position) => index === position ? { ...item, [key]: value } : item));
    invalidate();
  }
  function selectPrevious(id: string) {
    if (id === editing) return;
    setEditing(id);
    const record = serviceData?.records.find(item => String(item.id) === id);
    const fromReceipt = (field: ReceiptField) => parsed ? singleCandidate(parsed, field) : '';
    if (record) {
      setSchedule(record.schedule_id === null ? '' : String(record.schedule_id));
      if (editing && parsed?.items.length) setItems(parsed.items);
      else if (!parsed?.items.length) setItems(serviceData?.items.filter(item => item.service_id === record.id).map(item => ({
        description: item.description, quantity: item.quantity_text ?? '', cost: item.cost_paise === null ? '' : (item.cost_paise / 100).toFixed(2),
      })) ?? []);
      setDraft(previous => ({
        ...previous,
        category: (editing ? '' : previous.category) || record.category,
        date: (editing ? fromReceipt('date') : previous.date) || record.service_date,
        odometer: (editing ? fromReceipt('odometer') : previous.odometer) || String(record.odometer_km),
        merchant: (editing ? fromReceipt('merchant') : previous.merchant) || record.workshop || '',
        total: (editing ? fromReceipt('total') : previous.total) || (record.cost_paise / 100).toFixed(2),
      }));
    } else {
      setSchedule('');
      setItems(parsed?.items ?? []);
      setDraft(previous => ({ ...previous, category: '', date: fromReceipt('date'),
        odometer: fromReceipt('odometer'), merchant: fromReceipt('merchant'), total: fromReceipt('total') }));
    }
    invalidate();
  }

  async function acquire(source: Parameters<typeof chooseReceipt>[0]) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(''); setImageError(''); setStatus('');
    try {
      const file = await chooseReceipt(source);
      if (!file) return;
      await validateReceiptImage(file.uri, file.name);
      setAsset(file);
      setParsed(undefined); setRaw(''); setShowRaw(false); setItems([]); setDraft({}); setPrintedUnit('');
      setSchedule(''); setEditing(''); invalidate();
      if (!nativeOcrAvailable) { setStatus('Image attached. Enter the receipt fields manually.'); return; }
      setStatus('Reading the image on this device…');
      const text = await recognizeReceipt(file.uri);
      const result = parseReceipt(text);
      setRaw(text); setParsed(result);
      const values = Object.fromEntries(Object.keys(result.fields).map(key => [key, singleCandidate(result, key as ReceiptField)])) as Draft;
      const inferredQuantity = values.quantity?.match(/^([\d.]+)\s+(kg|L)$/);
      if (inferredQuantity) { values.quantity = inferredQuantity[1]; setPrintedUnit(inferredQuantity[2]); }
      setDraft(values);
      if (kind === 'service') setItems(result.items);
      setStatus(result.kind !== 'unknown' && result.kind !== kind
        ? 'The text looks like a different receipt type. Check the evidence before saving.'
        : 'Review each field. Choose a source value where the receipt is ambiguous.');
    } catch (cause) {
      setStatus('');
      setImageError(cause instanceof Error ? cause.message : 'Could not read the image. You can enter the details manually.');
    } finally { locked.current = false; setBusy(false); }
  }

  async function save(override = false) {
    if (locked.current) return;
    if (!vehicle || !confirmed) { setError('Select a vehicle and confirm the reviewed fields.'); return; }
    locked.current = true;
    setBusy(true); setError('');
    try {
      const date = draft.date?.trim() ?? '';
      const odometer = draft.odometer?.trim() ?? '';
      const total = draft.total?.trim() ?? '';
      let review: ReviewInput;
      if (kind === 'fuel') {
        if (hasUnitConflict) throw Error('The printed quantity unit does not match the vehicle. Choose the matching vehicle or enter a verified quantity manually.');
        const printedFuel = draft.fuel?.trim().toLowerCase();
        if (printedFuel && (vehicle.fuel_type === 'cng' ? printedFuel !== 'cng'
          : printedFuel === 'cng' || (vehicle.fuel_type !== 'hybrid' && printedFuel !== vehicle.fuel_type))) {
          throw Error('The reviewed fuel type does not match the selected vehicle.');
        }
        const form = { date, time: draft.time?.trim() ?? '', odometerKm: odometer, quantityAmount: draft.quantity?.trim() ?? '',
          totalPaidRupees: total, fillType: draft.fill ?? '' };
        const errors = Object.values(validateFuelEntryForm(form, unit));
        if (errors.length) throw Error(errors.join('\n'));
        review = { kind, date, record: toFuelEntryInput(form, vehicle.id, unit) };
      } else {
        const costPaise = parseServiceCostPaise(total);
        if (!odometer || !/^\d+$/.test(odometer) || costPaise === null) throw Error('Enter a whole odometer reading and a valid invoice total.');
        const record = { vehicleId: vehicle.id, scheduleId: schedule ? Number(schedule) : null,
          category: draft.category?.trim() ?? '', serviceDate: date, odometerKm: Number(odometer), costPaise,
          workshop: draft.merchant?.trim() || null, notes: serviceData?.records.find(item => String(item.id) === editing)?.notes ?? null,
          completed: true };
        const validation = validateMaintenanceRecord(record);
        if (validation) throw Error(validation);
        review = { kind, record, items, editingId: editing ? Number(editing) : undefined };
      }
      let fingerprint: string | null = null;
      if (asset) {
        const file = await validateReceiptImage(asset.uri, asset.name);
        const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
        fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      }
      await commitAttachment(asset ? () => persistAttachment(asset) : undefined, async attachment => {
        await receiptTransaction(db, tx => saveReviewedReceipt(tx, review, {
          attachment: attachment ?? null, fingerprint, reference: draft.reference ?? '', merchant: draft.merchant ?? '',
        }, override));
      }, discardAttachment);
      await selectVehicle(vehicle.id).catch(() => {});
      setRaw('');
      router.replace(kind === 'fuel' ? '/(tabs)/fuel' : '/(tabs)/maintenance');
    } catch (cause) {
      setDuplicate(cause instanceof DuplicateReceiptError);
      setError(cause instanceof Error ? cause.message : 'The reviewed receipt could not be saved.');
    } finally { locked.current = false; setBusy(false); }
  }

  function field(key: keyof Draft, label: string, maxLength = 120) {
    const candidates = parsed?.fields[key as ReceiptField] ?? [];
    return <View style={{ gap: 6 }}>
      <TextField label={label} value={draft[key] ?? ''} maxLength={maxLength} onChangeText={value => { if (key === 'quantity') setPrintedUnit(''); update(key, value); }} />
      {candidates.length > 0 && <>
        <Text style={{ color: colors.muted }}>{candidates.length > 1 ? 'Multiple possible values · choose or enter one' : 'Recognized candidate · verify against the image'}</Text>
        {candidates.map(candidate => <AppButton key={candidate.value}
          label={candidate.value + ' · ' + candidate.source.slice(0, 95)} variant="ghost"
          onPress={() => {
            const [amount, candidateUnit] = candidate.value.split(' ');
            if (key === 'quantity') setPrintedUnit(candidateUnit ?? '');
            update(key, key === 'quantity' ? amount : candidate.value);
          }} />)}
      </>}
    </View>;
  }

  const hasUnitConflict = !!vehicle && !!printedUnit && printedUnit !== (unit === 'kg' ? 'kg' : 'L');
  const amountConflict = !!draft.quantity && !!draft.rate && !!draft.total &&
    Math.abs(Number(draft.quantity) * Number(draft.rate) - Number(draft.total)) > 1;
  const listedItemTotal = items.reduce((sum, item) => sum + (parseServiceCostPaise(item.cost) ?? 0), 0);
  const invoiceTotal = parseServiceCostPaise(draft.total ?? '');
  return <Screen>
    <AppButton label="Cancel and go back" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <PageHeading title={kind === 'fuel' ? 'Scan Fuel Receipt' : 'Scan Service Bill'} subtitle="Read an image on this device or enter the receipt details manually." />
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AppButton label="Take photo" variant="secondary" disabled={busy} onPress={() => void acquire('camera')} />
        <AppButton label="Choose gallery image" variant="secondary" disabled={busy} onPress={() => void acquire('gallery')} />
      </View>
      <AppButton label="Choose image from files" variant="secondary" disabled={busy} onPress={() => void acquire('files')} />
      {!nativeOcrAvailable && <Text style={{ color: colors.muted }}>Native OCR requires the DriveSentry development build. Manual review and attachment saving are available here.</Text>}
      {asset && <Image accessibilityLabel="Original receipt image" source={{ uri: asset.uri }} resizeMode="contain" style={{ height: 270, width: '100%' }} />}
      {imageError ? <InlineMessage tone="error">{imageError}</InlineMessage> : null}
      {status ? <InlineMessage>{status}</InlineMessage> : null}
      {busy && status.startsWith('Reading') && <LoadingState label="Recognizing receipt text…" />}
      {raw ? <AppButton label={showRaw ? 'Hide recognized text' : 'Show recognized text'} variant="ghost" onPress={() => setShowRaw(value => !value)} /> : null}
      {showRaw && <Text selectable style={{ color: colors.muted }}>{raw}</Text>}
    </Card>
    <Card>
      <ChoiceField label="Confirm vehicle" value={vehicleId} options={vehicles.map(item => ({ value: String(item.id), label: item.name }))}
        onChange={id => {
          if (id === vehicleId) return;
          if (editing) selectPrevious('');
          setVehicleId(id);
          setSchedule('');
          invalidate();
        }} />
      {!vehicles.length && <AppButton label="Add a vehicle first" onPress={() => router.push('/vehicles/new')} />}
      {kind === 'service' && !!serviceData?.records.length &&
        <ChoiceField label="Service record" value={editing} options={[{ value: '', label: 'Create new service' },
          ...serviceData.records.slice(0, 20).map(item => ({ value: String(item.id), label: item.service_date + ' · ' + item.category }))]} onChange={selectPrevious} />}
      {field('merchant', kind === 'fuel' ? 'Pump or merchant' : 'Workshop')}
      {field('reference', kind === 'fuel' ? 'Transaction reference' : 'Invoice number', 100)}
      {field('registration', 'Printed registration (review only)', 25)}
      {field('date', 'Date (YYYY-MM-DD)', 10)}
      {kind === 'fuel' && field('time', 'Time (24-hour HH:MM)', 5)}
      {field('odometer', 'Recorded odometer (km)', 12)}
      {kind === 'fuel' ? <>
        {field('fuel', 'Printed fuel type (optional)', 20)}
        {field('quantity', 'Fuel quantity (' + (vehicle ? unit : 'select a vehicle') + ')', 12)}
        {field('rate', 'Printed unit price in INR (review only)', 14)}
        <ChoiceField label="Tank fill" value={draft.fill ?? ''} options={[{ value: 'full', label: 'Full tank' }, { value: 'partial', label: 'Partial refill' }]}
          onChange={value => update('fill', value)} />
        {hasUnitConflict && <InlineMessage tone="error">The printed unit differs from the selected vehicle. Check the receipt, vehicle and quantity.</InlineMessage>}
        {amountConflict && <InlineMessage>Quantity × unit price differs from the total by over ₹1. Review any discounts, tax or rounding.</InlineMessage>}
      </> : <>
        {field('category', 'Service category', 80)}
        {!!serviceData?.schedules.length && <ChoiceField label="Apply to an existing schedule" value={schedule}
          options={[{ value: '', label: 'No schedule' }, ...serviceData.schedules.map(item => ({ value: String(item.id), label: item.category }))]}
          onChange={id => { setSchedule(id); invalidate(); }} />}
        {field('gst', 'Printed tax / GST (review only)', 14)}
        {field('discount', 'Printed discount (review only)', 14)}
        {field('labour', 'Printed labour subtotal (review only)', 14)}
        {field('parts', 'Printed parts subtotal (review only)', 14)}
      </>}
      {field('total', 'Final amount paid (₹)', 14)}
    </Card>
    {kind === 'service' && <Card>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Invoice line items</Text>
      <Text style={{ color: colors.muted }}>Reviewed items describe the service. Only the final invoice total contributes to spending.</Text>
      {items.map((item, index) => <View key={index} style={{ gap: 8 }}>
        <TextField label={'Item ' + (index + 1) + ' description'} value={item.description} onChangeText={value => editItem(index, 'description', value)} maxLength={160} />
        <TextField label="Quantity (optional)" value={item.quantity} onChangeText={value => editItem(index, 'quantity', value)} />
        <TextField label="Item cost (₹, optional)" value={item.cost} onChangeText={value => editItem(index, 'cost', value)} />
        <AppButton label={'Remove item ' + (index + 1)} variant="ghost" onPress={() => {
          setItems(current => current.filter((_, position) => position !== index)); invalidate();
        }} />
      </View>)}
      <AppButton label="Add line item" variant="secondary" disabled={items.length >= 30} onPress={() => { setItems(current => [...current, emptyItem]); invalidate(); }} />
      {listedItemTotal > 0 && invoiceTotal !== null && Math.abs(listedItemTotal - invoiceTotal) > 100 &&
        <InlineMessage>Line items differ from the final amount. Confirm any tax, discount, rounding, or missing items.</InlineMessage>}
    </Card>}
    <Card>
      <ChoiceField label="Review confirmation" value={confirmed ? 'yes' : ''} options={[{ value: 'yes', label: 'I verified the vehicle and record details' }]}
        onChange={() => { setConfirmed(current => !current); setDuplicate(false); }} />
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      <AppButton label={duplicate ? 'Confirm separate transaction and save' : 'Save reviewed record'} loading={busy}
        onPress={() => void save(duplicate)} />
    </Card>
  </Screen>;
}
