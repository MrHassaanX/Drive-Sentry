import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getLatestFuelReading } from '../fuel/calculations';
import { listFuelEntries } from '../fuel/repository';
import { formatRupees } from '../fuel/formatters';
import { listDocuments } from '../ownership/documents';
import { reconcileReminders } from '../ownership/reminders';
import { dismissRepair, readServiceIntelligence, saveRepairRule } from './receiptRepository';
import { repairInsights } from './repairs';
import { deleteWarranty, listWarranties, saveWarranty, warrantyExpiry, warrantyStatus, type Warranty, type WarrantyDraft } from './warranties';

const blank = (vehicleId: number): WarrantyDraft => ({
  vehicle_id: vehicleId, component: '', provider_type: 'manufacturer', brand: null, vendor: null,
  installed_on: null, expires_on: null, duration_months: null, installed_km: null, limit_km: null,
  notes: null, remind: 0, document_id: null, service_id: null,
});
const kinds = [
  { value: 'manufacturer', label: 'Manufacturer' }, { value: 'workshop', label: 'Workshop' }, { value: 'other', label: 'Other' },
] as const;

export default function IntelligenceScreen() {
  const { section, vehicle, warranty, review } = useLocalSearchParams<{ section?: string; vehicle?: string; warranty?: string; review?: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const { selectedVehicle, vehicles } = useSelectedVehicle();
  const owner = vehicle ? vehicles.find(v => String(v.id) === vehicle) : selectedVehicle;
  const id = owner?.id;
  const view = section === 'repairs' ? 'repairs' : 'warranties';
  const [data, setData] = useState<{
    vehicleId: number; history: Awaited<ReturnType<typeof readServiceIntelligence>>;
    warranties: Warranty[]; documents: Awaited<ReturnType<typeof listDocuments>>; odometer: number;
  }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id?: number; value: WarrantyDraft }>();
  const [limits, setLimits] = useState({ days: '', km: '' });
  const [selectedService, setSelectedService] = useState(review ?? '');
  const refresh = useCallback(async (active: () => boolean = () => true, initialize = false) => {
    if (id === undefined) return;
    const [history, warranties, docs, fuel] = await Promise.all([
      readServiceIntelligence(db, id), listWarranties(db, id), listDocuments(db), listFuelEntries(db, id),
    ]);
    if (!active()) return;
    const odometer = Math.max(owner?.current_odometer_km ?? 0, getLatestFuelReading(fuel)?.odometer_km ?? 0,
      ...history.records.filter(record => record.completed === 1).map(item => item.odometer_km));
    setData({ vehicleId: id, history, warranties, documents: docs.filter(doc => doc.vehicle_id === id), odometer });
    setLimits({ days: String(history.rule.max_days), km: String(history.rule.max_km) });
    if (initialize && warranty) {
      const item = warranties.find(row => String(row.id) === warranty);
      if (item) setDraft({ id: item.id, value: item });
    }
  }, [db, id, owner, warranty]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh(() => active, true).catch(() => { if (active) setError('Could not load this vehicle’s service intelligence.'); });
    return () => { active = false; };
  }, [refresh]));
  const current = data?.vehicleId === id ? data : undefined;
  const insights = current && id !== undefined ? repairInsights(id, current.history.records, current.history.items,
    current.warranties, current.history.rule, current.history.dismissed) : [];
  const services = current?.history.records ?? [];
  const chosenService = services.find(item => String(item.id) === selectedService);
  const invoiceItems = current?.history.items.filter(item => item.service_id === chosenService?.id) ?? [];
  const invoiceLink = current?.history.links.find(item => item.service_id === chosenService?.id);
  const selectPdf = (documentId: number) => router.push({ pathname: '/documents', params: { show: String(documentId) } });
  const edit = (item: Warranty) => { setDraft({ id: item.id, value: item }); router.setParams({ section: 'warranties' }); };
  const update = <K extends keyof WarrantyDraft>(key: K, value: WarrantyDraft[K]) =>
    setDraft(current => current && { ...current, value: { ...current.value, [key]: value } });
  const textField = (key: 'component' | 'brand' | 'vendor' | 'installed_on' | 'expires_on' | 'notes', label: string, length: number) =>
    <TextField label={label} value={draft?.value[key] ?? ''} maxLength={length} onChangeText={value => {
      if (key === 'component') update(key, value);
      else update(key, value || null);
    }} />;
  const numberField = (key: 'duration_months' | 'installed_km' | 'limit_km', label: string) =>
    <TextField label={label} keyboardType="numeric" maxLength={9}
      value={draft?.value[key] === null ? '' : String(draft?.value[key] ?? '')}
      onChangeText={value => { if (/^\d*$/.test(value)) update(key, value ? Number(value) : null); }} />;
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete the action.'); }
    finally { setBusy(false); }
  }
  return <Screen key={draft ? 'edit' : view}>
    <AppButton label="Back" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <PageHeading title={view === 'repairs' ? 'Repair Insights' : 'Warranty Tracker'} subtitle={owner?.name ?? 'Select a vehicle to see its records.'} />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    {id === undefined ? <AppButton label="My Vehicles" onPress={() => router.push('/(tabs)/vehicles')} /> :
      !current ? <LoadingState label="Loading vehicle history…" /> : <>
        {!draft && <Card>
          <ChoiceField label="Vehicle" value={String(id)} options={vehicles.map(item => ({ value: String(item.id), label: item.name }))}
            onChange={value => { setDraft(undefined); setSelectedService(''); router.setParams({ vehicle: value, warranty: undefined }); }} />
          <ChoiceField label="Service intelligence" value={view}
            options={[{ value: 'warranties', label: 'Warranties' }, { value: 'repairs', label: 'Repair history' }]}
            onChange={value => { setDraft(undefined); router.setParams({ section: value }); }} />
        </Card>}
        {view === 'warranties' ? draft ? <Card>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{draft.id ? 'Edit component warranty' : 'New component warranty'}</Text>
          {textField('component', 'Component or service', 100)}
          <ChoiceField label="Warranty provider" value={draft.value.provider_type} options={[...kinds]} onChange={value => update('provider_type', value)} />
          {textField('brand', 'Brand or model (optional)', 120)}
          {textField('vendor', 'Vendor or workshop (optional)', 120)}
          {textField('installed_on', 'Installation date (YYYY-MM-DD, optional)', 10)}
          {textField('expires_on', 'Expiry date (YYYY-MM-DD, optional)', 10)}
          {numberField('duration_months', 'Duration in months (optional)')}
          {numberField('installed_km', 'Installation odometer (km, optional)')}
          {numberField('limit_km', 'Distance limit from installation (km, optional)')}
          {textField('notes', 'Terms or notes (optional)', 2000)}
          <ChoiceField label="Expiry reminders" value={String(draft.value.remind)} options={[{ value: '0', label: 'Off' }, { value: '1', label: 'On' }]}
            onChange={value => update('remind', Number(value))} />
          {draft.value.remind === 1 && <Text style={{ color: colors.muted }}>Uses the reminder permission and intervals in Settings.</Text>}
          {!!current.documents.length && <ChoiceField label="Linked receipt or wallet document" value={String(draft.value.document_id ?? '')}
            options={[{ value: '', label: 'No document' }, ...current.documents.map(item => ({ value: String(item.id), label: item.title }))]}
            onChange={value => update('document_id', value ? Number(value) : null)} />}
          {!!services.length && <ChoiceField label="Linked service" value={String(draft.value.service_id ?? '')}
            options={[{ value: '', label: 'No service' }, ...services.map(item => ({ value: String(item.id), label: item.service_date + ' · ' + item.category }))]}
            onChange={value => update('service_id', value ? Number(value) : null)} />}
          <AppButton label="Save warranty" loading={busy} onPress={() => void perform(async () => {
            await saveWarranty(db, draft.value, draft.id); setDraft(undefined); router.setParams({ warranty: undefined });
            await reconcileReminders(db).catch(() => setError('Warranty saved. Reminder reconciliation will retry when the app opens.'));
          })} />
          <AppButton label="Cancel" variant="ghost" disabled={busy} onPress={() => { setDraft(undefined); router.setParams({ warranty: undefined }); }} />
        </Card> : <>
          <AppButton label="Add warranty" onPress={() => setDraft({ value: blank(id) })} />
          {!current.warranties.length && <InlineMessage>No component warranties recorded for this vehicle.</InlineMessage>}
          {current.warranties.map(item => <Card key={item.id}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{item.component}</Text>
            <Text style={{ color: colors.muted }}>{kinds.find(kind => kind.value === item.provider_type)?.label}{item.brand ? ' · ' + item.brand : ''}{item.vendor ? ' · ' + item.vendor : ''}</Text>
            <Text style={{ color: colors.accent, fontWeight: '800' }}>{warrantyStatus(item, current.odometer)}{warrantyExpiry(item) ? ' · ' + warrantyExpiry(item) : ''}</Text>
            {item.limit_km !== null && <Text style={{ color: colors.muted }}>{item.limit_km.toLocaleString('en-IN')} km from installation{item.installed_km === null ? ' · installation reading missing' : ' at ' + item.installed_km.toLocaleString('en-IN') + ' km'}</Text>}
            {item.notes ? <Text style={{ color: colors.text }}>{item.notes}</Text> : null}
            {item.document_id !== null && <AppButton label="Open warranty document" variant="secondary" onPress={() => selectPdf(item.document_id!)} />}
            {item.service_id !== null && <AppButton label="Review linked service" variant="ghost" onPress={() => {
              setSelectedService(String(item.service_id)); router.setParams({ section: 'repairs' });
            }} />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <AppButton label="Edit warranty" variant="ghost" disabled={busy} onPress={() => edit(item)} />
              <AppButton label="Delete warranty" variant="danger" disabled={busy} onPress={() => Alert.alert('Delete warranty?', 'Linked documents and services stay in your records.', [
                { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void perform(async () => {
                  await deleteWarranty(db, item.id, id);
                  await reconcileReminders(db).catch(() => setError('Warranty deleted. Reminder reconciliation will retry when the app opens.'));
                }) },
              ])} />
            </View>
          </Card>)}
        </> : <>
          <InlineMessage>Recorded service history insight — not a mechanical diagnosis.</InlineMessage>
          <Card>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Repeat thresholds</Text>
            <Text style={{ color: colors.muted }}>Same component and vehicle, within both limits. Common routine items use at most 60 days and 1,500 km.</Text>
            <TextField label="Maximum days" keyboardType="numeric" value={limits.days} onChangeText={days => setLimits(value => ({ ...value, days }))} />
            <TextField label="Maximum recorded km" keyboardType="numeric" value={limits.km} onChangeText={km => setLimits(value => ({ ...value, km }))} />
            <AppButton label="Save thresholds" variant="secondary" disabled={busy} onPress={() => void perform(async () => {
              await saveRepairRule(db, id, { max_days: Number(limits.days), max_km: Number(limits.km) });
            })} />
          </Card>
          {!insights.length && <InlineMessage>No repeat observations match this vehicle’s rule.</InlineMessage>}
          {insights.map(item => <Card key={item.key}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{item.component} recorded twice</Text>
            <Text style={{ color: colors.muted }}>{item.days} days · {item.km.toLocaleString('en-IN')} recorded km apart</Text>
            {[item.previous, item.current].map(record => <AppButton key={record.id}
              label={record.service_date + ' · ' + record.odometer_km.toLocaleString('en-IN') + ' km'}
              variant="secondary" onPress={() => setSelectedService(String(record.id))} />)}
            {item.warranty && <AppButton label="Review possible warranty overlap" variant="secondary" onPress={() => edit(item.warranty!)} />}
            <AppButton label="Dismiss observation" variant="ghost" disabled={busy}
              onPress={() => void perform(async () => { await dismissRepair(db, id, item.key); })} />
          </Card>)}
          {!!services.length && <Card>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Review service and line items</Text>
            <ChoiceField label="Service history" value={selectedService}
              options={services.slice(0, 30).map(item => ({ value: String(item.id), label: item.service_date + ' · ' + item.category }))}
              onChange={setSelectedService} />
            {chosenService && <>
              <Text style={{ color: colors.text }}>{chosenService.workshop || 'Workshop not recorded'} · {formatRupees(chosenService.cost_paise)}</Text>
              {invoiceItems.map(item => <Text style={{ color: colors.muted }} key={item.id}>{item.description}
                {item.quantity_text ? ' × ' + item.quantity_text : ''}{item.cost_paise !== null ? ' · ' + formatRupees(item.cost_paise) : ''}</Text>)}
              {invoiceLink && <AppButton label="Open original invoice" variant="secondary" onPress={() => selectPdf(invoiceLink.document_id)} />}
              <AppButton label="Edit service record" variant="ghost" onPress={() => router.push({ pathname: '/maintenance/[id]/edit', params: { id: String(chosenService.id), vehicle: String(id) } })} />
            </>}
          </Card>}
        </>}
      </>}
  </Screen>;
}
