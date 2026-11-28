import type { SQLiteDatabase } from 'expo-sqlite';
import { validDate } from './dates.ts';

export const documentCategories = ['Registration Certificate (RC)', 'Vehicle insurance', 'Pollution Under Control (PUC)',
  'Driving licence', 'Road tax', 'Vehicle fitness certificate', 'Warranty document', 'Service-related document', 'Other'];

export type WalletDocument = {
  id: number; vehicle_id: number | null; title: string; category: string; description: string;
  issued_on: string | null; expires_on: string | null; document_number: string | null; attachment: string | null;
};
export type DocumentDraft = Omit<WalletDocument, 'id'>;

export async function listDocuments(db: SQLiteDatabase) {
  return db.getAllAsync<WalletDocument>('SELECT * FROM ownership_documents ORDER BY expires_on IS NULL, expires_on, title, id');
}

export function validateDocument(input: DocumentDraft) {
  if (!input.title.trim() || input.title.trim().length > 100) throw Error('Enter a title with up to 100 characters.');
  if (!documentCategories.includes(input.category)) throw Error('Choose a document category.');
  if (input.description.length > 1000 || (input.document_number?.length ?? 0) > 100) throw Error('The description or document number is too long.');
  if ([input.issued_on, input.expires_on].some(date => date !== null && !validDate(date))) throw Error('Enter calendar dates using YYYY-MM-DD.');
  if (input.issued_on && input.expires_on && input.issued_on > input.expires_on) throw Error('Expiry must be on or after issue.');
}

export async function saveDocument(db: SQLiteDatabase, input: DocumentDraft, original?: WalletDocument) {
  validateDocument(input);
  const values = [input.vehicle_id, input.category, input.title.trim(), input.description.trim(),
    input.issued_on, input.expires_on, input.document_number, input.attachment];
  if (!original) {
    const result = await db.runAsync(`INSERT INTO ownership_documents
      (vehicle_id, category, title, description, issued_on, expires_on, document_number, attachment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ...values);
    return result.lastInsertRowId;
  }
  const result = await db.runAsync(`UPDATE ownership_documents SET vehicle_id = ?, category = ?, title = ?,
    description = ?, issued_on = ?, expires_on = ?, document_number = ?, attachment = ?
    WHERE id = ? AND vehicle_id IS ? AND attachment IS ?`, ...values, original.id, original.vehicle_id, original.attachment);
  if (!result.changes) throw Error('The document changed. Reopen it and try again.');
  return original.id;
}

export async function deleteDocument(db: SQLiteDatabase, item: WalletDocument) {
  await db.runAsync('DELETE FROM ownership_documents WHERE id = ? AND vehicle_id IS ?', item.id, item.vehicle_id);
}
