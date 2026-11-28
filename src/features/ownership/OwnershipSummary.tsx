import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton, Card, InlineMessage, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { listDocuments, type WalletDocument } from './documents';
import { expiryStatus } from './dates';
import { getReminderSettings, saveReminderSettings } from './reminders';

export function OwnershipSummary({ vehicleId }: { vehicleId?: number }) {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [items, setItems] = useState<WalletDocument[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void listDocuments(db).then(rows => {
      if (active) setItems(rows.filter(row => row.vehicle_id === null || row.vehicle_id === vehicleId));
    }).catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [db, vehicleId]));
  const urgent = items.filter(item => expiryStatus(item.expires_on) === 'Expired');
  const soon = items.filter(item => expiryStatus(item.expires_on) === 'Expiring soon');
  return <Card>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Ownership</Text>
    <Text style={{ color: colors.muted }}>{urgent.length} expired · {soon.length} expiring within 30 days</Text>
    {[...urgent, ...soon].slice(0, 3).map(item => <AppButton key={item.id} label={item.title + ' · ' + expiryStatus(item.expires_on)}
      variant="secondary" onPress={() => router.push({ pathname: '/documents', params: { edit: String(item.id) } })} />)}
    <AppButton label="Document Wallet" variant="secondary" onPress={() => router.push('/documents')} />
    {vehicleId !== undefined && <AppButton label="Ownership Analytics" variant="ghost"
      onPress={() => router.push({ pathname: '/ownership', params: { vehicle: String(vehicleId) } })} />}
  </Card>;
}

export function ReminderSettings() {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [enabled, setEnabled] = useState(false);
  const [intervals, setIntervals] = useState('30,15,7,1,0');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const settings = await getReminderSettings(db);
    setEnabled(!!settings.enabled); setIntervals(settings.intervals); setLoaded(true);
  }, [db]);
  useFocusEffect(useCallback(() => {
    void load().catch(() => setMessage('Reminder settings could not be loaded.'));
  }, [load]));
  async function update(value = enabled) {
    setBusy(true);
    setMessage('');
    try {
      await saveReminderSettings(db, value, value ? intervals : (await getReminderSettings(db)).intervals);
      await load();
      setMessage(value ? 'Reminder schedule updated.' : 'Expiry reminders disabled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update reminders.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Document and warranty reminders</Text>
    <Text style={{ color: colors.muted }}>Schedule local alerts at 9 am in your device time zone. Use 0 for expiry day.</Text>
    <TextField label="Days before expiry, separated by commas" value={intervals} onChangeText={setIntervals} />
    <AppButton label={enabled ? 'Save reminder intervals' : 'Enable expiry reminders'} disabled={!loaded} loading={busy}
      onPress={() => void update(true)} />
    {enabled && <AppButton label="Disable expiry reminders" variant="secondary" disabled={busy} onPress={() => void update(false)} />}
    {message ? <InlineMessage>{message}</InlineMessage> : null}
  </Card>;
}
