import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, Metric, Screen } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import {
  CITIES, METRO_CITIES, cityPriceStatus, sourceAgeDays, type CityId, type PriceFuel,
} from './model';
import { INDIA_PETROLEUM_DOCS } from './provider';
import { useFuelPrices } from './useFuelPrices';
import NearbyOutletPrices from './NearbyOutletPrices';

const cityChoices = METRO_CITIES.map((value): { value: CityId; label: string } => ({ value, label: CITIES[value].name }));
const views = [{ value: 'nearby', label: 'Nearby outlets' }, { value: 'reference', label: 'City references' }] as const;
const fuelChoices: { value: 'all' | PriceFuel; label: string }[] = [
  { value: 'all', label: 'Both fuels' }, { value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' },
];
const statusLabels = { live: 'Retrieved online', saved: 'Saved on this device', stale: 'Stale saved prices' };
const indiaDate = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' } as const;
const indiaTime = { ...indiaDate, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const;

function formatEffectiveDate(value: string) {
  return new Date(value + 'T00:00:00+05:30').toLocaleDateString('en-IN', indiaDate);
}

function openSource(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Open the source from a browser.'));
}

export default function FuelPricesScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { colors } = useAppTheme();
  const [mode, setMode] = useState<'nearby' | 'reference'>(view === 'reference' ? 'reference' : 'nearby');
  return (
    <Screen>
      <AppButton label="‹ Fuel" accessibilityLabel="Back to Fuel" variant="ghost" onPress={() => router.back()} />
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Indian Fuel Prices</Text>
      <ChoiceField label="Price coverage" value={mode} options={[...views]} onChange={setMode} />
      {mode === 'nearby' ? <NearbyOutletPrices onCityPrices={() => setMode('reference')} /> : <CityReferencePrices />}
    </Screen>
  );
}

function CityReferencePrices() {
  const { colors } = useAppTheme();
  const { cityId, selectCity, refresh, result, error, loading } = useFuelPrices();
  const [fuel, setFuel] = useState<'all' | PriceFuel>('all');
  const cityPrices = result?.prices.filter(price => price.cityId === cityId) ?? [];
  const firstPrice = cityPrices[0];
  const age = firstPrice ? sourceAgeDays(firstPrice.effectiveDate) : 0;
  const priceStatus = cityPriceStatus(firstPrice, result?.status === 'stale');

  return (
    <>
      <ChoiceField label="City" value={cityId} options={cityChoices} onChange={selectCity} />
      <ChoiceField label="Fuel" value={fuel} options={fuelChoices} onChange={setFuel} />
      {loading && !firstPrice ? <LoadingState label="Fetching metro reference prices…" /> : null}
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {firstPrice && result ? (
        <>
          <View style={[styles.status, { backgroundColor: priceStatus === 'stale' ? colors.dangerSoft : colors.accentSoft }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {priceStatus === 'stale' ? 'Stale city reference' : 'City reference'}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Effective {formatEffectiveDate(firstPrice.effectiveDate)} (India) · {statusLabels[result.status]}
            </Text>
            {age > 2 ? <Text style={[styles.body, { color: colors.danger }]}>The latest source date is {age} days old.</Text> : null}
          </View>
          <View style={styles.priceRow}>
            {cityPrices.filter(price => fuel === 'all' || price.fuel === fuel).map(price => (
              <Card key={price.fuel} style={styles.priceCard}>
                <Metric label={price.productName}
                  value={formatRupees(price.paisePerLitre)} suffix="/ L" />
              </Card>
            ))}
          </View>
          {result.notice ? <InlineMessage>{result.notice}</InlineMessage> : null}
          <Card>
            <Text style={[styles.title, { color: colors.text }]}>IndianOil metro reference prices</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Individual pump prices may differ. Source: {firstPrice.source}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Source table dated {formatEffectiveDate(firstPrice.sourcePostedDate)}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Retrieved on this device {new Date(firstPrice.retrievedAt).toLocaleString('en-IN', indiaTime)}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>Delivered by the independent India Petroleum API.</Text>
            <AppButton label="View PPAC source" variant="secondary" onPress={() => openSource(firstPrice.sourceUrl)} />
          </Card>
        </>
      ) : null}
      <AppButton label="Refresh prices" loading={loading} onPress={refresh} />
      <AppButton label="Provider information" variant="ghost" onPress={() => openSource(INDIA_PETROLEUM_DOCS)} />
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 20 },
  status: { padding: 14, borderRadius: 13, gap: 4 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  priceCard: { flexGrow: 1, minWidth: 138, padding: 12 },
});
