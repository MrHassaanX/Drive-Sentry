import { useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, ChoiceField, InlineMessage, Metric, PageHeading, Screen, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatRupees } from '../fuel/formatters';
import { stationBrand } from '../stations/brands';
import { stationDisplay } from '../stations/displayName';
import type { Station } from '../stations/provider';
import { FUEL_PRODUCT_NAMES, PRICE_FUELS, type OutletFuelPrice, type PriceFuel } from './model';
import { officialPriceCheck, outletPriceView, personalEstimate, priceLabels } from './outletPrices';

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

export default function OutletPriceCard({ station, prices = [], onCityPrices }: {
  station: Station;
  prices?: readonly OutletFuelPrice[];
  onCityPrices: () => void;
}) {
  const { colors } = useAppTheme();
  const [showCheck, setShowCheck] = useState(false);
  const quotes = (['petrol', 'diesel', 'premium'] as const).flatMap(product => {
    const quote = outletPriceView(station.id, product, prices);
    return quote.price ? [{ price: quote.price, freshness: quote.freshness, currentOfficial: quote.currentOfficial }] : [];
  });
  return (
    <View>
      {!!quotes.length && <View style={styles.row}>
        {quotes.map(({ price, freshness, currentOfficial }) => (
          <View key={price.productClass} style={[styles.price, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.heading, { color: colors.text }]}>{price.productName}</Text>
            <Text style={{ color: colors.text }}>{formatRupees(price.paisePerLitre)}/L</Text>
            <Text style={{ color: colors.muted }}>
              {currentOfficial ? 'Official outlet price' : priceLabels[price.coverage]}{freshness === 'stale' ? ' · Stale' : ''}
              {price.observedAt ? ' · Observed ' : ' · Retrieved '}
              {new Date(price.observedAt ?? price.retrievedAt).toLocaleDateString('en-IN', indiaDate)}
            </Text>
            {price.effectiveDate && <Text style={{ color: colors.muted }}>
              Effective {new Date(price.effectiveDate + 'T00:00:00+05:30').toLocaleDateString('en-IN', indiaDate)}
            </Text>}
            <Text accessibilityRole="link" style={{ color: colors.accent }} onPress={() => link(price.sourceUrl)}>{price.source}</Text>
            {!currentOfficial && <Text style={{ color: colors.muted }}>Current pump rate unconfirmed.</Text>}
          </View>
        ))}
      </View>}
      <AppButton label="Check official price" variant="ghost" onPress={() => setShowCheck(true)} />
      {showCheck && <PriceCheck station={station} onClose={() => setShowCheck(false)}
        onCityPrices={() => { setShowCheck(false); onCityPrices(); }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  price: { flex: 1, padding: 8, borderRadius: 9, gap: 2 },
  heading: { fontSize: 13, fontWeight: '700' },
});
