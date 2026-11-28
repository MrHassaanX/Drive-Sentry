import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export async function receiptTransaction<T>(db: SQLiteDatabase, action: (connection: SQLiteDatabase) => Promise<T>) {
  const path = db.databasePath.replaceAll('\\', '/');
  const separator = path.lastIndexOf('/');
  const connection = await openDatabaseAsync(path.slice(separator + 1), { useNewConnection: true },
    separator >= 0 ? path.slice(0, separator) : undefined);
  try {
    await connection.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; BEGIN IMMEDIATE;');
    try {
      const result = await action(connection);
      await connection.execAsync('COMMIT;');
      return result;
    } catch (error) {
      await connection.execAsync('ROLLBACK;').catch(() => {});
      throw error;
    }
  } finally {
    await connection.closeAsync().catch(() => {});
  }
}
