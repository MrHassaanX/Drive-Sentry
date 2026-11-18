import assert from 'node:assert/strict';
import test from 'node:test';
import { distance, normalize, nearby, searchArea, fresh, fetchArea } from '../src/features/stations/provider.ts';
import { searchStations } from '../src/features/stations/search.ts';

const origin = { latitude:0, longitude:0 };
const tags = {amenity:'fuel'};
const node = {type:'node',id:7,lat:0,lon:0.02,tags};
const way = {type:'way',id:7,center:{lat:0,lon:0.01},tags:{...tags,brand:'Fixture','fuel:diesel':'yes'}};
const fixture = {elements:[node,node,way,{...way,type:'relation',center:{lat:0,lon:0.08}}]};

test('Haversine and exact radius order preserve distinct OSM objects',()=>{
  assert.ok(Math.abs(distance(origin,{latitude:0,longitude:1})-111.195)<0.001);
  const stations=normalize(fixture);
  assert.deepEqual(nearby(stations,origin,3).map(s=>s.id),['way/7','node/7']);
  assert.equal(nearby(stations,origin,10).length,3);
  assert.equal(stations[0].name,'Unnamed fuel station');
  assert.equal(stations[0].fuels,'');
  assert.equal(stations[1].fuels,'diesel');
  assert.deepEqual(normalize({elements:[]}),[]);
  for(const invalid of [null,{}, {elements:[],remark:'timeout'}, {elements:[{...node,lat:91}]}]) assert.throws(()=>normalize(invalid));
});

test('cache is isolated by area/radius and stale results survive network errors',async(t)=>{
  let calls=0;
  const originKey=searchArea(origin)+'/3';
  const row={payload:JSON.stringify(fixture),fetched:new Date().toISOString()};
  const db={getFirstAsync:async(_,key)=>key===originKey ? row : null};
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('offline');});
  assert.equal((await searchStations(db,origin,3)).status,'Saved results');
  assert.equal(calls,0);
  row.fetched='2000-01-01T00:00:00Z';
  assert.equal(fresh(row.fetched),false);
  assert.match((await searchStations(db,origin,3)).status,/stale.*offline/);
  await assert.rejects(searchStations(db,origin,5));
});

test('rate limit and timeout errors permit no unbounded retries',async(t)=>{
  let now=Date.now()+120000;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>({status:429}));
  await assert.rejects(fetchArea('0,0',3),/limiting requests/);
  await assert.rejects(fetchArea('0,0',3),/wait/);
  now+=61000;
  t.mock.method(globalThis,'setTimeout',cb=>{cb();return 0;});
  await assert.rejects(fetchArea('0,0',3),/timed out/);
});

test('a successful provider response is saved and sorted for display', async (t) => {
  t.mock.method(Date, 'now', () => 2000000000000);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => fixture }));
  let saved;
  const db = {
    getFirstAsync: async () => null,
    runAsync: async (_query, key, payload, fetched) => { saved = { key, payload, fetched }; },
    execAsync: async () => {},
  };
  const result = await searchStations(db, origin, 5);
  assert.deepEqual(result.stations.map(station => station.id), ['way/7', 'node/7']);
  assert.equal(saved.key, '0.00,0.00/5');
  assert.deepEqual(JSON.parse(saved.payload), fixture);
  assert.equal(saved.fetched, result.fetched);
});
