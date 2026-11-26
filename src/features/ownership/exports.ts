import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { startActivityAsync } from 'expo-intent-launcher';

const directory = () => new Directory(Paths.cache, 'ownership-reports');

export async function openPdf(file: File) {
  if (Platform.OS === 'android') {
    try {
      await startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: 'application/pdf', flags: 1 });
      return;
    } catch { /* Let the user choose a compatible viewer or save destination. */ }
  }
  await shareReport(file, 'application/pdf');
}
export async function shareReport(file: File, mime: string) {
  if (!await Sharing.isAvailableAsync()) throw Error('The device share menu is unavailable.');
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: mime === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text' });
}

export async function createReport(content: string | Uint8Array, format: 'csv' | 'pdf') {
  const folder = directory();
  folder.create({ idempotent: true, intermediates: true });
  const file = new File(folder, 'DriveSentry-ownership-' + Crypto.randomUUID().slice(0, 8) + '.' + format);
  if (typeof content !== 'string') await file.write(content);
  else if (format === 'csv') await file.write('\uFEFF' + content);
  else {
    const result = await Print.printToFileAsync({ html: content });
    const printed = new File(result.uri);
    try {
      await printed.move(file);
    } catch (error) {
      if (file.exists) file.delete();
      if (printed.exists) printed.delete();
      throw error;
    }
  }
  if (!file.exists || !file.size) throw Error('The report file could not be created.');
  return file;
}

export function cleanReports() {
  const folder = directory();
  if (!folder.exists) return;
  for (const file of folder.list()) {
    if (file instanceof File && /^DriveSentry-ownership-[0-9a-f]{8}\.(?:csv|pdf)$/.test(file.name)
      && file.modificationTime !== null && Date.now() - file.modificationTime > 86_400_000) {
      try { file.delete(); } catch { /* Retry on the next launch. */ }
    }
  }
}
