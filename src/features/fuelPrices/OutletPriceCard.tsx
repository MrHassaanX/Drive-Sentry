import { useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, ChoiceField, InlineMessage, Metric, PageHeading, Screen, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import { stationBrand } from '../stations/brands';
import { stationDisplay } from '../stations/displayName';
import { INDIA_FUEL_PUMPS, INDIA_FUEL_PUMPS_SOURCE } from '../stations/indiaFuelPumps';
import type { Station } from '../stations/provider';
import { FUEL_PRODUCT_NAMES, PRICE_FUELS, type OutletFuelPrice, type PriceFuel } from './model';
import { officialPriceCheck, outletPriceQuotes, personalEstimate, priceLabels } from './outletPrices';

const choices = PRICE_FUELS.map(value => ({ value, label: FUEL_PRODUCT_NAMES[value] }));
const indiaDate = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' } as const;

function link(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Check the pump display or ask the outlet.'));
}

function PriceCheck({ station, onClose, onCityPrices }: { station: Station; onClose: () => void; onCityPrices: () => void }) {
  const { colors } = useAppTheme();
  const [fuel, setFuel] = useState<PriceFuel>('petrol');
  const [rupees, setRupees] = useState('');
  const [litres, setLitres] = useState('');
  const [estimate, setEstimate] = useState<ReturnType<typeof personalEstimate>>();
  const official = officialPriceCheck(stationBrand(station));
  const display = stationDisplay(station);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <AppButton label="Close price check" variant="ghost" onPress={onClose} />
          <PageHeading title="Check outlet prices" subtitle={display.title} />
          <Card>
            <Text style={[styles.heading, { color: colors.text }]}>Official price check</Text>
            <Text style={{ color: colors.muted }}>
              {official?.guidance ?? 'Check the pump display or ask this outlet for the current petrol and diesel rates.'}
            </Text>
            {official && <AppButton label={official.label} onPress={() => link(official.url)} />}
            {official?.appUrl && <AppButton label="View HP PAY app" variant="secondary" onPress={() => link(official.appUrl)} />}
            <AppButton label="City reference prices" variant="secondary" onPress={onCityPrices} />
          </Card>
          <Card>
            <Text style={[styles.heading, { color: colors.text }]}>Estimate a fill-up</Text>
            <Text style={{ color: colors.muted }}>Use a rate you checked at the outlet. This estimate stays in this price check.</Text>
            <ChoiceField label="Fuel" options={choices} value={fuel} onChange={value => { setFuel(value); setEstimate(undefined); }} />
            <TextField label="Price you checked (₹/L)" value={rupees} keyboardType="decimal-pad"
              onChangeText={value => { setRupees(value); setEstimate(undefined); }} maxLength={7} />
            <TextField label="Litres to buy" value={litres} keyboardType="decimal-pad"
              onChangeText={value => { setLitres(value); setEstimate(undefined); }} maxLength={8} />
            <AppButton label="Calculate estimate" onPress={() => {
              Keyboard.dismiss();
              setEstimate(personalEstimate(station.id, fuel, rupees, litres));
            }} />
            {estimate === null && <InlineMessage tone="error">Enter a positive rate and litres. Use up to two decimals for the price and three for litres.</InlineMessage>}
            {estimate && <>
              <Metric label="Estimated total" value={formatRupees(estimate.totalPaise)} />
              <Text style={{ color: colors.muted }}>{priceLabels[estimate.price.coverage]} · {estimate.price.productName} · {formatRupees(estimate.price.paisePerLitre)}/L</Text>
            </>}
          </Card>
        </Screen>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function OutletQuote({ quote }: { quote: ReturnType<typeof outletPriceQuotes>[number] }) {
  const { colors } = useAppTheme();
  const { price, freshness, currentOfficial, ageHours } = quote;
  const label = freshness === 'stale' ? 'Stale observation' : freshness === 'older' ? 'Older observation' : 'Recent observation';
  const age = ageHours < 1 ? 'less than 1 h ago' : ageHours < 24 ? ageHours + ' h ago' : Math.floor(ageHours / 24) + ' d ago';
  return <View style={[styles.price, { backgroundColor: colors.surfaceRaised }]}>
    <Text style={[styles.heading, { color: colors.text }]}>{price.productName} · {formatRupees(price.paisePerLitre)}/L</Text>
    <Text style={{ color: freshness === 'stale' ? colors.danger : colors.muted }}>
      {currentOfficial ? 'Official outlet price' : priceLabels[price.coverage] + ' · ' + label}
    </Text>
    <Text style={{ color: colors.muted }}>
      {price.observedAt ? 'Source checked ' : 'Retrieved '}{new Date(price.observedAt ?? price.retrievedAt).toLocaleDateString('en-IN', indiaDate)}
      {' · ' + age}
      {price.effectiveDate && ' · Effective ' + new Date(price.effectiveDate + 'T00:00:00+05:30').toLocaleDateString('en-IN', indiaDate)}
    </Text>
    <Text accessibilityRole="link" style={{ color: colors.accent }} onPress={() => link(price.sourceUrl)}>{price.source}</Text>
    {price.provider === INDIA_FUEL_PUMPS && <Text accessibilityRole="link" style={{ color: colors.accent }}
      onPress={() => link(INDIA_FUEL_PUMPS_SOURCE)}>{INDIA_FUEL_PUMPS} · MIT</Text>}
    {price.observedAt && <Text style={{ color: colors.muted }}>
      Retrieved {new Date(price.retrievedAt).toLocaleDateString('en-IN', indiaDate)}
    </Text>}
  </View>;
}

export default function OutletPriceCard({ station, prices = [], premiumFirst = false, onCityPrices }: {
  station: Station;
  prices?: readonly OutletFuelPrice[];
  premiumFirst?: boolean;
  onCityPrices: () => void;
}) {
  const { colors } = useAppTheme();
  const [showCheck, setShowCheck] = useState(false);
  const order = premiumFirst ? ['premium', 'petrol', 'diesel'] as const : ['petrol', 'diesel', 'premium'] as const;
  const quotes = order.flatMap(product => outletPriceQuotes(station.id, product, prices));
  return (
    <View>
      {!!quotes.length && <ScrollView style={styles.quotes} contentContainerStyle={styles.row} nestedScrollEnabled>
        {quotes.map(quote => <OutletQuote key={quote.price.fuel + '/' + quote.price.productName} quote={quote} />)}
      </ScrollView>}
      <Text style={[styles.coverage, { color: colors.muted }]}>{quotes.length
        ? 'Confirm current price at the pump.' : 'No source-reported price for this outlet.'}</Text>
      <AppButton label="Check official price" variant="ghost" onPress={() => setShowCheck(true)} />
      {showCheck && <PriceCheck station={station} onClose={() => setShowCheck(false)}
        onCityPrices={() => { setShowCheck(false); onCityPrices(); }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  quotes: { maxHeight: 164 },
  row: { gap: 8 },
  price: { padding: 8, borderRadius: 9, gap: 2 },
  coverage: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  heading: { fontSize: 13, fontWeight: '700' },
});
