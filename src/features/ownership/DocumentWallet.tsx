import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, PageHeading, Screen, TextField } from '../../components/ui';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';
import { deleteDocument, documentCategories, listDocuments, saveDocument, type DocumentDraft, type WalletDocument } from './documents';
import { expiryStatus } from './dates';
import { cleanWalletFiles, discardAttachment, persistAttachment, pickAttachment, walletFile } from './files';
import { commitAttachment } from './attachmentType';
import { reconcileReminders } from './reminders';
import { openPdf } from './exports';

const blank = (vehicle: number | null): DocumentDraft => ({
  vehicle_id: vehicle, title: '', category: documentCategories[0], description: '',
  issued_on: null, expires_on: null, document_number: null, attachment: null,
});
const statuses = ['All', 'Expired', 'Expiring soon', 'Valid', 'No expiry'];

export default function DocumentWallet() {
  const db = useSQLiteContext();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { vehicles, selectedVehicle } = useSelectedVehicle();
  const { colors } = useAppTheme();
  const [rows, setRows] = useState<WalletDocument[]>();
  const [editor, setEditor] = useState<{ draft: DocumentDraft; original?: WalletDocument }>();
  const [asset, setAsset] = useState<DocumentPickerAsset>();
  const [preview, setPreview] = useState<string>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');
  const [vehicle, setVehicle] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const owners = [{ value: 'owner', label: 'Owner' }, ...vehicles.map(v => ({ value: String(v.id), label: v.name }))];

  const refresh = useCallback(async () => {
    try { setRows(await listDocuments(db)); }
    catch { setError('Could not load the document wallet.'); }
  }, [db]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void listDocuments(db).then(items => {
      if (!active) return;
      setRows(items);
      const selected = edit && items.find(item => String(item.id) === edit);
      if (selected) setEditor({ draft: selected, original: selected });
    }).catch(() => { if (active) setError('Could not load the document wallet.'); });
    return () => { active = false; };
  }, [db, edit]));

  function begin(document?: WalletDocument) {
    setAsset(undefined);
    setPreview(undefined);
    setError('');
    setEditor({ original: document, draft: document ?? blank(selectedVehicle?.id ?? null) });
  }
  function update<K extends keyof DocumentDraft>(key: K, value: DocumentDraft[K]) {
    setEditor(current => current && { ...current, draft: { ...current.draft, [key]: value } });
  }
  const close = () => { setEditor(undefined); if (edit) router.setParams({ edit: undefined }); };
  async function save() {
    if (!editor || busy) return;
    setBusy(true);
    setError('');
    try {
      await commitAttachment(asset ? () => persistAttachment(asset) : undefined,
        replacement => saveDocument(db, { ...editor.draft, attachment: replacement ?? editor.draft.attachment }, editor.original),
        discardAttachment);
      close();
      setAsset(undefined);
      await refresh();
      await cleanWalletFiles(db);
      await reconcileReminders(db);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the document.');
    } finally { setBusy(false); }
  }
  function confirmDelete(item: WalletDocument) {
    Alert.alert('Delete document?', 'This removes the saved document and its attachment.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
        await deleteDocument(db, item);
        setPreview(undefined);
        await refresh();
        await cleanWalletFiles(db);
        await reconcileReminders(db);
      })().catch(() => setError('Could not finish deleting the document.')) },
    ]);
  }
  async function open(name: string) {
    try {
      const file = walletFile(name);
      if (!file.exists) throw Error('The attachment is unavailable.');
      if (!name.endsWith('.pdf')) setPreview(current => current === name ? undefined : name);
      else await openPdf(file);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the attachment.'); }
  }
  const visible = rows?.filter(item => (vehicle === 'all' || vehicle === (item.vehicle_id === null ? 'owner' : String(item.vehicle_id)))
    && (category === 'All' || category === item.category) && (status === 'All' || status === expiryStatus(item.expires_on))
    && (item.title + ' ' + item.description + ' ' + item.category).toLowerCase().includes(query.trim().toLowerCase()));
  const draft = editor?.draft;

  return <Screen key={draft ? 'editor' : 'list'}>
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={{ color: colors.accent }}>‹ Back</Text></Pressable>
    <PageHeading title="Document Wallet" subtitle="Vehicle and owner documents are stored in this app. Uninstalling can remove them." />
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    {!!draft ? <Card>
      <Text style={{ color: colors.text, fontWeight: '800' }}>{editor.original ? 'Edit document' : 'New document'}</Text>
      <TextField label="Title" value={draft.title} maxLength={100} onChangeText={v => update('title', v)} />
      <ChoiceField label="Belongs to" value={draft.vehicle_id === null ? 'owner' : String(draft.vehicle_id)} options={owners} onChange={v => update('vehicle_id', v === 'owner' ? null : Number(v))} />
      <ChoiceField label="Category" value={draft.category} options={documentCategories.map(value => ({ value, label: value }))} onChange={v => update('category', v)} />
      <TextField label="Description (optional)" multiline maxLength={1000} value={draft.description} onChangeText={v => update('description', v)} />
      <TextField label="Issue date (YYYY-MM-DD, optional)" value={draft.issued_on ?? ''} onChangeText={v => update('issued_on', v.trim() || null)} />
      <TextField label="Expiry date (YYYY-MM-DD, optional)" value={draft.expires_on ?? ''} onChangeText={v => update('expires_on', v.trim() || null)} />
      <TextField label="Document number (optional)" secureTextEntry maxLength={100} value={draft.document_number ?? ''} onChangeText={v => update('document_number', v || null)} />
      <AppButton label={asset || draft.attachment ? 'Choose replacement attachment' : 'Choose attachment'} variant="secondary" disabled={busy} onPress={() => void pickAttachment().then(file => { if (file) setAsset(file); }).catch(() => setError('Could not open the document picker.'))} />
      {asset || draft.attachment ? <AppButton label={asset ? 'Discard pending attachment' : 'Remove attachment'} variant="ghost" disabled={busy} onPress={() => asset ? setAsset(undefined) : update('attachment', null)} /> : null}
      <AppButton label="Save document" loading={busy} onPress={() => void save()} />
      <AppButton label="Cancel" variant="ghost" disabled={busy} onPress={close} />
    </Card> : <>
      <AppButton label="Add document" onPress={() => begin()} />
      <Card>
        <TextField label="Search documents" value={query} onChangeText={setQuery} />
        <AppButton label={filtersOpen ? 'Hide filters' : 'Filter documents'} variant="secondary" onPress={() => setFiltersOpen(open => !open)} />
        {filtersOpen ? <>
          <ChoiceField label="Scope" value={vehicle} options={[{ value: 'all', label: 'All vehicles and owner' }, ...owners]} onChange={setVehicle} />
          <ChoiceField label="Status" value={status} options={statuses.map(value => ({ value, label: value }))} onChange={setStatus} />
          <ChoiceField label="Category" value={category} options={['All', ...documentCategories].map(value => ({ value, label: value }))} onChange={setCategory} />
        </> : vehicle !== 'all' || status !== 'All' || category !== 'All' ?
          <AppButton label="Clear filters" variant="ghost" onPress={() => { setVehicle('all'); setStatus('All'); setCategory('All'); }} /> : null}
      </Card>
      {!visible ? <LoadingState label="Loading documents…" /> : visible.length === 0 ? <InlineMessage>No documents match. Add a document or change the filters.</InlineMessage> : visible.map(item => {
        const state = expiryStatus(item.expires_on);
        return <Card key={item.id}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{item.title}</Text>
          <Text style={{ color: colors.muted }}>{item.category} · {vehicles.find(v => v.id === item.vehicle_id)?.name ?? 'Owner'}</Text>
          <Text style={{ color: state === 'Expired' ? colors.danger : colors.accent, fontWeight: '700' }}>{state}{item.expires_on ? ' · ' + item.expires_on : ''}</Text>
          {item.description ? <Text style={{ color: colors.text }}>{item.description}</Text> : null}
          {item.attachment ? <AppButton label={item.attachment.endsWith('.pdf') ? 'Open PDF' : 'Preview image'} variant="secondary" onPress={() => void open(item.attachment!)} /> : null}
          {preview && preview === item.attachment && <Image source={{ uri: walletFile(preview).uri }} resizeMode="contain" style={{ width: '100%', height: 240 }} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <AppButton label="Edit or renew" variant="ghost" onPress={() => begin(item)} />
            <AppButton label="Delete document" variant="danger" onPress={() => confirmDelete(item)} />
          </View>
        </Card>;
      })}
    </>}
  </Screen>;
}
