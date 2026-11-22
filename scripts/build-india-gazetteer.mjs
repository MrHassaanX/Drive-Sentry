import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';

const [placesPath, postalPath, destination] = process.argv.slice(2);
if (!destination) throw Error('Provide the extracted GeoNames IN.txt, postal IN.txt and output database path.');
const [placeText, postalText, SQL] = await Promise.all([
  readFile(placesPath, 'utf8'), readFile(postalPath, 'utf8'), initSqlJs(),
]);
const rows = placeText.split(/\r?\n/u).map(line => line.split('\t'));
const areas = new Map();
for (const [, name, ascii, , , , , code, country, , state, district] of rows) {
  if (country === 'IN' && (code === 'ADM1' || code === 'ADM2')) {
    areas.set(code === 'ADM1' ? state : state + '.' + district, ascii || name);
  }
}
const keyFor = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const db = new SQL.Database();
db.exec(`
  CREATE TABLE area (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
  CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, area INTEGER, lat INTEGER, lon INTEGER, rank INTEGER);
  CREATE TABLE lookup (key TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY(key,id)) WITHOUT ROWID;
  BEGIN;
`);
const insertPlace = db.prepare('INSERT INTO place VALUES (?,?,?,?,?,?)');
const insertArea = db.prepare('INSERT INTO area VALUES (?,?)');
const insertKey = db.prepare('INSERT OR IGNORE INTO lookup VALUES (?,?)');
const areaIds = new Map();
let nameCount = 0;
let postalCount = 0;
function add(id, name, parts, latitude, longitude, rank, keys) {
  if (!name || !latitude || !longitude || !Number.isFinite(+latitude) || !Number.isFinite(+longitude)) return false;
  const area = [...new Set(parts.filter(part => part && keyFor(part) !== keyFor(name)))].join(', ');
  if (!areaIds.has(area)) {
    const id = areaIds.size + 1;
    insertArea.run([id, area]);
    areaIds.set(area, id);
  }
  insertPlace.run([id, name, areaIds.get(area), Math.round(+latitude * 1e5), Math.round(+longitude * 1e5), rank]);
  for (const key of new Set(keys.map(keyFor))) if (key) insertKey.run([key, id]);
  return true;
}
for (const [id, name, ascii, aliases, lat, lon, cls, code, country, , state, district, , , population] of rows) {
  if (country !== 'IN' || !(cls === 'P' || /^ADM[1-4]$/u.test(code))) continue;
  const label = code === 'ADM2' && !/district|division/iu.test(name) ? name + ' District' : name;
  if (add(+id, label, [code === 'ADM2' ? undefined : areas.get(state + '.' + district), areas.get(state)], lat, lon,
    +population || (code === 'ADM1' ? 10000 : 0), [label, name, ascii, ...aliases.split(',')])) nameCount++;
}
for (const line of postalText.split(/\r?\n/u)) {
  const [country, pin, name, state, , district, , , , latitude, longitude] = line.split('\t');
  if (country !== 'IN' || !/^\d{6}$/u.test(pin)) continue;
  if (add(-postalCount - 1, name + ' · ' + pin, [district, state], latitude, longitude, 0, [pin])) postalCount++;
}
db.exec('COMMIT; VACUUM;');
await writeFile(destination, db.export());
console.log({ nameCount, postalCount });
