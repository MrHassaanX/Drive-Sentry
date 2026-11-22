import { importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { findIndianPlaces } from './gazetteerQuery';

let database: Promise<SQLiteDatabase> | undefined;
const databaseName = 'india-places-20261122-v1.db';

export async function searchIndiaGazetteer(text: string) {
  if (!database) {
    database = importDatabaseFromAssetAsync(databaseName, {
      assetId: require('../../../assets/india-places.db'),
    }).then(() => openDatabaseAsync(databaseName)).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return findIndianPlaces(await database, text);
}
