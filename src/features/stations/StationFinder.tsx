import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton, Card, ChoiceField, InlineMessage, PageHeading, Screen } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { mysuru, type Point, type Radius } from './provider';
import { searchStations } from './search';

type Origin = Point & { label: string };
async function directions(point: Point) {
  const destination = point.latitude + ',' + point.longitude;
  const web = 'https://www.google.com/maps/dir/?api=1&destination=' + destination;
  try {
    await Linking.openURL(Platform.OS === 'android' ? 'google.navigation:q=' + destination : web);
  } catch {
    try { await Linking.openURL(web); }
    catch { Alert.alert('Directions unavailable', 'Station coordinates: ' + destination); }
  }
}

export default function StationFinder() {
  const db = useSQLiteContext();
  const {colors} = useAppTheme();
  const body = { color:colors.text, fontSize:15, lineHeight:22 };
  const [permission, setPermission] = useState('Not checked');
  const [origin,setOrigin] = useState<Origin>();
  const [radius,setRadius] = useState<Radius>(5);
  const [result,setResult] = useState<Awaited<ReturnType<typeof searchStations>>>();
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    Location.getForegroundPermissionsAsync().then(p => { if (active) setPermission(p.status); }).catch(()=>{});
    return () => { active = false; };
  }, []);
  async function run(source: 'gps'|'demo'|'reuse', km: Radius, refresh = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setResult(undefined);
    setMessage('');
    setRadius(km);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let center = origin;
      if (source === 'demo') center = {...mysuru,label:'Mysuru, Karnataka · manual demo'};
      if (source === 'gps') {
        setOrigin(undefined);
        const p = await Location.requestForegroundPermissionsAsync();
        setPermission(p.status);
        if (!p.granted) throw new Error(p.canAskAgain ? 'Location permission denied. Retry or select Mysuru.' : 'Allow location in device settings or select Mysuru.');
        if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services are off. Enable GPS or select Mysuru.');
        const cachedFix = await Location.getLastKnownPositionAsync({maxAge:60000, requiredAccuracy:250});
        const fix = cachedFix ?? await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}),
          new Promise<never>((_,reject)=>{ timer=setTimeout(()=>reject(new Error('Location timed out. Retry or select Mysuru.')),15000); })]);
        center = {...fix.coords,label:'Current device location'};
      }
      if (!center) return;
      setOrigin(center);
      setResult(await searchStations(db,center,km,refresh));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Station search unavailable. Please retry.');
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setBusy(false);
    }
  }
  return <Screen>
    <AppButton label="Back to Fuel" variant="ghost" onPress={()=>router.back()} />
    <PageHeading eyebrow="India Fuel Assistant" title="Nearby petrol pumps" subtitle="Find mapped fuel stations around your chosen location." />
    <Card>
      <Text style={body}>{origin?.label ?? 'Choose a search location'}</Text>
      <Text style={{color:colors.muted}}>Foreground permission · {permission}</Text>
      <Text style={{color:colors.muted}}>Search sends a rounded location to Overpass.</Text>
      <AppButton label="Use current location" disabled={busy} onPress={()=>void run('gps',radius)} />
      <AppButton label="Use Mysuru demo location" disabled={busy} variant="secondary" onPress={()=>void run('demo',radius)} />
      <View pointerEvents={busy ? 'none' : 'auto'}>
        <ChoiceField label="Search radius" value={String(radius)} options={[3,5,10].map(n=>({value:String(n),label:n+' km'}))} onChange={v=>void run('reuse',Number(v) as Radius)} />
      </View>
      <AppButton label="Refresh stations" disabled={!origin || busy} variant="secondary" onPress={()=>void run('reuse',radius,true)} />
    </Card>
    {busy && <InlineMessage>Searching…</InlineMessage>}
    {!!message && <InlineMessage tone="error">{message}</InlineMessage>}
    <Text accessibilityRole="link" onPress={()=>Linking.openURL('https://www.openstreetmap.org/copyright').catch(()=>Alert.alert('OpenStreetMap copyright','openstreetmap.org/copyright'))} style={{color:colors.accent}}>© OpenStreetMap contributors · ODbL</Text>
    {result && <>
      <Text style={body}>{result.stations.length} stations within {radius} km</Text>
      <Text style={{color:colors.muted}}>{result.status} · {new Date(result.fetched).toLocaleString()}</Text>
      <Text style={body}>Approximate straight-line distances. Community fuel tags do not confirm current stock.</Text>
      {!result.stations.length && <InlineMessage>No mapped stations found here. Try a wider radius.</InlineMessage>}
      {result.stations.map(s=><Card key={s.id}>
        <Text style={{...body,fontWeight:'700',fontSize:18}}>{s.name}</Text>
        <Text style={{color:colors.accent}}>{s.km.toFixed(2)} km · straight line</Text>
        {[s.brand,s.address,s.hours && 'Mapped hours · '+s.hours,s.fuels && 'Mapped fuels · '+s.fuels].filter(Boolean).map((v,i)=><Text key={i} style={body}>{v}</Text>)}
        <AppButton label="Get Directions" variant="secondary" onPress={()=>void directions(s)} />
      </Card>)}
    </>}
  </Screen>;
}
