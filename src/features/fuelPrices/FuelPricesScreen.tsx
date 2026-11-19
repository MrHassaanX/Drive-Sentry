import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, Metric, PageHeading, Screen } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import {
  CITIES, PPAC_SOURCE, PPAC_TABLE, isMetroCity, sourceAgeDays, type CityId, type PriceFuel,
} from './model';
import { INDIA_PETROLEUM_DOCS } from './provider';
import { useFuelPrices } from './useFuelPrices';

const cityChoices = (Object.keys(CITIES) as CityId[]).map(value => ({ value, label: CITIES[value].name }));
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
  const { colors } = useAppTheme();
  const { cityId, selectCity, refresh, result, error, loading } = useFuelPrices();
  const [fuel, setFuel] = useState<'all' | PriceFuel>('all');
  const city = CITIES[cityId];
  const supported = isMetroCity(cityId);
  const cityPrices = result?.prices.filter(price => price.cityId === cityId) ?? [];
  const firstPrice = cityPrices[0];
  const age = firstPrice ? sourceAgeDays(firstPrice.effectiveDate) : 0;

  return (
    <Screen>
      <AppButton label="‹ Fuel" accessibilityLabel="Back to Fuel" variant="ghost" onPress={() => router.back()} />
      <PageHeading title="Indian Fuel Prices" subtitle={city.name + ', ' + city.state} />
      <ChoiceField label="City" value={cityId} options={cityChoices} onChange={selectCity} />

      {!supported ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>{city.name} prices unavailable</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            The current price feed covers Delhi, Mumbai, Chennai and Kolkata.
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>Check a local IndianOil outlet</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {cityId === 'bengaluru'
              ? 'Send RSP 118219 to 92249 92249 for the example Bengaluru outlet, or use the dealer code at your own outlet.'
              : 'Ask an IndianOil outlet for its dealer code. Send RSP followed by a space and that code to 92249 92249.'}
            {' '}IndianOil provides indicative outlet prices.
          </Text>
        </Card>
      ) : (
        <>
          <ChoiceField label="Fuel" value={fuel} options={fuelChoices} onChange={setFuel} />
          {loading && !firstPrice ? <LoadingState label="Fetching metro reference prices…" /> : null}
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          {firstPrice && result ? (
            <>
              <View style={[styles.status, { backgroundColor: result.status === 'stale' || age > 2 ? colors.dangerSoft : colors.accentSoft }]}>
                <Text style={[styles.title, { color: colors.text }]}>{statusLabels[result.status]}</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  Effective {formatEffectiveDate(firstPrice.effectiveDate)} (India)
                </Text>
                {age > 2 ? <Text style={[styles.body, { color: colors.danger }]}>The latest source date is {age} days old.</Text> : null}
              </View>
              <View style={styles.priceRow}>
                {cityPrices.filter(price => fuel === 'all' || price.fuel === fuel).map(price => (
                  <Card key={price.fuel} style={styles.priceCard}>
                    <Metric label={price.fuel === 'petrol' ? 'Petrol' : 'Diesel'}
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
        </>
      )}
      <AppButton label="Provider information" variant="ghost" onPress={() => openSource(INDIA_PETROLEUM_DOCS)} />
      {!supported ? (
        <Text style={[styles.body, { color: colors.muted }]}>
          Metro data is sourced from {PPAC_SOURCE}.{' '}
          <Text accessibilityRole="link" style={{ color: colors.accent }} onPress={() => openSource(PPAC_TABLE)}>View coverage.</Text>
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 20 },
  status: { padding: 14, borderRadius: 13, gap: 4 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  priceCard: { flexGrow: 1, minWidth: 138, padding: 12 },
});
