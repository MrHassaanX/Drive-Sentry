import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Picker from 'expo-document-picker';
import { Platform } from 'react-native';
import { maximumAttachmentBytes, attachmentMime, verifiedExtension } from './attachmentType';

const directory = () => new Directory(Paths.document, 'ownership-wallet');
const safeName = /^[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/;

export function walletFile(name: string) {
  if (!safeName.test(name)) throw Error('Invalid wallet attachment.');
  return new File(directory(), name);
}

export async function pickAttachment() {
  // Android grants read access to the selected provider URI. Use that grant
  // directly because Expo Go keeps the picker cache outside the experience.
  const result = await Picker.getDocumentAsync({ type: Object.values(attachmentMime), copyToCacheDirectory: Platform.OS !== 'android' });
  return result.canceled ? undefined : result.assets[0];
}

export async function persistAttachment(asset: Picker.DocumentPickerAsset) {
  const source = new File(asset.uri);
  if (!source.exists || !source.size || source.size > maximumAttachmentBytes) {
    throw Error('Choose a readable attachment no larger than 20 MB.');
  }
  const handle = source.open();
  let extension: string;
  try { extension = verifiedExtension(asset.name, await handle.readBytes(12)); }
  finally { handle.close(); }
  const folder = directory();
  folder.create({ idempotent: true, intermediates: true });
  const name = Crypto.randomUUID() + '.' + extension;
  const target = walletFile(name);
  try {
    await source.copy(target);
    if (!target.exists || !target.size || target.size > maximumAttachmentBytes) throw Error('The attachment could not be saved within the 20 MB limit.');
  }
  catch (error) { discardAttachment(name); throw error; }
  return name;
}

export function discardAttachment(name: string) {
  try { const file = walletFile(name); if (file.exists) file.delete(); }
  catch { /* Retry orphan cleanup on next startup. */ }
}

export async function cleanWalletFiles(db: SQLiteDatabase, scanOrphans = false) {
  const rows = await db.getAllAsync<{ filename: string }>('SELECT filename FROM ownership_file_cleanup');
  for (const { filename } of rows) {
    try {
      const file = walletFile(filename);
      if (file.exists) file.delete();
      await db.runAsync('DELETE FROM ownership_file_cleanup WHERE filename = ?', filename);
    } catch { /* Retain the queue entry for retry. */ }
  }
  const folder = directory();
  if (scanOrphans && folder.exists) {
    const referenced = await db.getAllAsync<{ attachment: string }>('SELECT attachment FROM ownership_documents WHERE attachment IS NOT NULL');
    const names = new Set(referenced.map(row => row.attachment));
    for (const file of folder.list()) if (file instanceof File && safeName.test(file.name) && !names.has(file.name)) discardAttachment(file.name);
  }
}
