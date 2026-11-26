export const maximumAttachmentBytes = 20 * 1024 * 1024;
export const attachmentMime: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
const prefixes: Record<string, number[]> = {
  pdf: [37, 80, 68, 70, 45], jpg: [255, 216, 255], png: [137, 80, 78, 71, 13, 10, 26, 10],
  webp: [82, 73, 70, 70],
};
export function verifiedExtension(name: string, bytes: Uint8Array) {
  const suffix = name.split('.').pop()?.toLowerCase();
  const ext = suffix === 'jpeg' ? 'jpg' : suffix;
  const matches = ext && Object.hasOwn(prefixes, ext) && prefixes[ext].every((byte, index) => bytes[index] === byte);
  if (!matches || (ext === 'webp' && String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP')) {
    throw Error('Choose a valid PDF, JPEG, PNG or WebP attachment.');
  }
  return ext;
}

export async function commitAttachment(
  copy: (() => string | Promise<string>) | undefined,
  save: (replacement?: string) => Promise<void>,
  discard: (name: string) => void,
) {
  const replacement = await copy?.();
  try { await save(replacement); }
  catch (error) {
    if (replacement) discard(replacement);
    throw error;
  }
}
