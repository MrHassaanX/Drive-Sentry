import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import AddressSearch from '../stations/AddressSearch';
import { stationBrand } from '../stations/brands';
import { directions } from '../stations/directions';
import { stationDisplay } from '../stations/displayName';
import { mappedCity } from '../stations/provider';
import { useStationSearch } from '../stations/useStationSearch';
import OutletPriceCard, { OutletQuote } from './OutletPriceCard';
import { FUEL_PRODUCT_NAMES, PRICE_FUELS, type OutletFuelPrice } from './model';
import { nearbyPriceRows } from './outletPrices';

type ProductFilter = OutletFuelPrice['productClass'];
const fuels: { value: ProductFilter; label: string }[] = [
  ...PRICE_FUELS.map(value => ({ value, label: FUEL_PRODUCT_NAMES[value] })),
  { value: 'premium', label: 'Premium' },
];
const sortModes = [{ value: 'distance', label: 'Nearest' }, { value: 'price', label: 'Lowest recent price' }] as const;
const pageSize = 6;

export default function NearbyOutletPrices({ onCityPrices }: { onCityPrices: () => void }) {
  const { colors } = useAppTheme();
  const { origin, radius, result, message, busy, run } = useStationSearch();
  const [fuel, setFuel] = useState<ProductFilter>('petrol');
  const [sort, setSort] = useState<'distance' | 'price'>('distance');
  const [showAddress, setShowAddress] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const { rows, comparable } = nearbyPriceRows(result?.stations ?? [], fuel, sort === 'price');
  const priced = rows.filter(row => row.quotes.length);
  const visible = priced.length ? priced : rows;
  const originLabel = origin?.kind === 'address' ? 'Selected address: ' + origin.label : origin?.label;
  const city = origin?.kind === 'address' ? undefined : mappedCity(result?.stations ?? []);

  return <>
    <Card>
      <Text style={[styles.title, { color: colors.text }]}>{originLabel ?? (busy ? 'Finding your location…' : 'Location unavailable')}</Text>
      {origin && <Text style={{ color: colors.muted }}>{city ? city + ' · ' : ''}Within {radius} km</Text>}
      <View style={styles.actions}>
        <AppButton label="My Location" variant="secondary" disabled={busy} onPress={() => {
          setLimit(pageSize);
          run('gps', radius);
        }} />
        <AppButton label="Search city or address" variant="secondary" disabled={busy} onPress={() => setShowAddress(true)} />
        <AppButton label="View on map" variant="ghost" onPress={() => {
          if (fuel === 'premium') router.push('/fuel/premium');
          else router.push({ pathname: '/fuel/nearby', params: { priceFuel: fuel } });
        }} />
        {origin && <AppButton label="Refresh nearby outlets" variant="ghost" disabled={busy} onPress={() => run('reuse', radius, true)} />}
      </View>
    </Card>
    <ChoiceField label="Fuel" value={fuel} options={fuels} onChange={value => {
      setFuel(value);
      setLimit(pageSize);
    }} />
    {comparable && <ChoiceField label="Sort" value={sort} options={[...sortModes]} onChange={value => {
      setSort(value);
      setLimit(pageSize);
    }} />}
    {busy && !result && <LoadingState label="Searching nearby outlets…" />}
    {!!message && <InlineMessage tone="error">{message}</InlineMessage>}
    {result && <>
      <Text style={[styles.title, { color: colors.text }]}>{rows.length} nearby outlets · {priced.length} with reported {fuel} prices</Text>
      <Text style={{ color: colors.muted }}>
        {result.source} · {result.status} · Retrieved {new Date(result.fetched).toLocaleString()}
      </Text>
      <InlineMessage>{priced.length ? 'Confirm current price at the pump.'
        : 'No source-reported prices for these outlets. Use the official price check for an individual pump.'}</InlineMessage>
      {visible.slice(0, limit).map(({ station, quotes }) => {
        const display = stationDisplay(station);
        const brand = stationBrand(station);
        return <Card key={station.id}>
          <Text style={[styles.title, { color: colors.text }]}>{display.title}</Text>
          <Text style={{ color: colors.muted }}>{station.km.toFixed(2)} km{brand ? ' · ' + brand : ''}</Text>
          {display.secondary && <Text style={{ color: colors.muted }}>{display.secondary}</Text>}
          {quotes.length ? quotes.map(quote => (
            <OutletQuote key={quote.price.fuel + '/' + quote.price.productName} quote={quote} />
          )) : <OutletPriceCard station={station} onCityPrices={onCityPrices} />}
          <AppButton label="Get Directions" variant="secondary" onPress={() => void directions(station)} />
        </Card>;
      })}
      {visible.length > limit && <AppButton label="Show more outlets" variant="secondary" onPress={() => setLimit(limit + pageSize)} />}
    </>}
    {showAddress && <AddressSearch onClose={() => setShowAddress(false)} onSelect={place => {
      setShowAddress(false);
      setLimit(pageSize);
      run(place, radius);
    }} />}
  </>;
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
