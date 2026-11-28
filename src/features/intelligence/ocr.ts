import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import * as Picker from 'expo-image-picker';
import * as Documents from 'expo-document-picker';
import { Platform } from 'react-native';
import { maximumAttachmentBytes, verifiedExtension } from '../ownership/attachmentType';

const engine = requireOptionalNativeModule<{ recognize(uri: string): Promise<string> }>('DriveSentryOcr');
export const nativeOcrAvailable = !!engine;

export async function chooseReceipt(source: 'camera' | 'gallery' | 'files') {
  if (source === 'files') {
    const result = await Documents.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: Platform.OS !== 'android',
    });
    return result.canceled ? undefined : result.assets[0];
  }
  if (source === 'camera' && !(await Picker.requestCameraPermissionsAsync()).granted) {
    throw Error('Allow camera access to take a photo, or choose an existing image.');
  }
  const options: Picker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = await (source === 'camera' ? Picker.launchCameraAsync(options) : Picker.launchImageLibraryAsync(options));
  if (result.canceled) return;
  const image = result.assets[0];
  return { name: image.fileName ?? image.uri.split('/').at(-1) ?? '', uri: image.uri, size: image.fileSize, mimeType: image.mimeType, lastModified: 0 };
}

export async function validateReceiptImage(uri: string, name: string) {
  const file = new File(uri);
  if (!file.exists || !file.size || file.size > maximumAttachmentBytes) throw Error('Choose a readable image no larger than 20 MB.');
  const handle = file.open();
  try {
    if (verifiedExtension(name, await handle.readBytes(12)) === 'pdf') throw Error('Unsupported receipt image.');
  } catch {
    throw Error('Choose a valid JPEG, PNG or WebP receipt image.');
  } finally { handle.close(); }
  return file;
}

export async function recognizeReceipt(uri: string) {
  if (!engine) throw Error('On-device OCR is available in the DriveSentry native build. You can review and save manually here.');
  const text = (await engine.recognize(uri)).trim();
  if (!text) throw Error('No readable text was found. Try a sharper image or enter the details manually.');
  return text.slice(0, 24_000);
}
