import { useState } from 'react';
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native';
import { FuelAssistant } from '../../components/FuelAssistant';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppButton, Card, ChoiceField, InlineMessage, LoadingState, Metric, Screen } from '../../components/ui';
import { deleteFuelEntry } from '../../features/fuel/repository';
import { useFuelEntries } from '../../features/fuel/useFuelEntries';
import { getLatestFuelReading } from '../../features/fuel/calculations';
import { formatFuelDate, formatFuelQuantity, formatRupees } from '../../features/fuel/formatters';
import type { FuelEntry } from '../../features/fuel/types';
import { useSelectedVehicle } from '../../context/SelectedVehicleContext';
import { useAppTheme } from '../../hooks/useAppTheme';

const vehicleSections = [{ value: 'records', label: 'Fuel Records' }, { value: 'insights', label: 'Mileage & Expenses' }] as const;

export default function FuelScreen() {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const { selectedVehicle } = useSelectedVehicle();
  const { entries, insights, isLoading, error, refresh } = useFuelEntries();
  const latestFuelReading = getLatestFuelReading(entries);
  const [actionError, setActionError] = useState<string | null>(null);
  const [vehicleSection, setVehicleSection] = useState<'records' | 'insights'>('records');
  const segmentByEndEntry = new Map(insights.mileageSegments.map((segment) => [segment.endEntryId, segment]));

  const confirmDelete = (entry: FuelEntry) => {
    Alert.alert(
      'Delete this refill?',
      'This removes the fuel record. Any mileage calculation that used it will be recalculated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete record',
          style: 'destructive',
          onPress: () => {
            void deleteFuelEntry(database, entry.id, entry.vehicle_id).then(() => {
              setActionError(null);
              refresh();
            }).catch(() => {
              setActionError('The fuel record could not be deleted. Please try again.');
            });
          },
        },
      ],
    );
  };

  if (!selectedVehicle) {
    return (
      <Screen>
        <FuelAssistant />
        <AppButton label="Smart Trip Planner" variant="secondary" onPress={() => router.push('/trip-planner')} />
        <AppButton label="Scan Fuel Receipt" variant="secondary" onPress={() => router.push({ pathname: '/receipt', params: { kind: 'fuel' } })} />
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>My Vehicle</Text>
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Choose a vehicle first</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Fuel entries are saved to one vehicle at a time. Add a vehicle or select one in My Vehicles.</Text>
          <AppButton label="Go to My Vehicles" onPress={() => router.push('/(tabs)/vehicles')} />
        </Card>
      </Screen>
    );
  }

  const isElectric = selectedVehicle.fuel_type === 'electric';

  return (
    <Screen>
      <FuelAssistant />
      <AppButton label="Smart Trip Planner" variant="secondary" onPress={() => router.push('/trip-planner')} />
      <AppButton label="Scan Fuel Receipt" variant="secondary" onPress={() => router.push({ pathname: '/receipt', params: { kind: 'fuel' } })} />
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>My Vehicle</Text>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{selectedVehicle.name} · {selectedVehicle.manufacturer} {selectedVehicle.model}</Text>
      <ChoiceField label="Vehicle fuel" value={vehicleSection} options={[...vehicleSections]} onChange={setVehicleSection} />
      <Text style={[styles.body, { color: colors.muted }]}>Profile odometer: {selectedVehicle.current_odometer_km.toLocaleString('en-IN')} km</Text>
      {latestFuelReading ? <Text style={[styles.body, { color: colors.muted }]}>Latest fuel reading: {latestFuelReading.odometer_km.toLocaleString('en-IN')} km</Text> : null}
      {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}

      {isLoading ? <LoadingState label="Loading fuel records…" /> : error ? (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Your records are unavailable</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{error}</Text>
          <AppButton label="Try again" onPress={refresh} variant="secondary" />
        </Card>
      ) : isElectric && entries.length === 0 ? (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Charging records are deferred</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Electric charging records are unavailable.</Text>
        </Card>
      ) : (
        <>
          {isElectric ? <InlineMessage>Charging records are deferred. Previously saved refills remain available below.</InlineMessage> : null}
          {vehicleSection === 'insights' && <><View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Metric label="SPENT THIS MONTH" value={formatRupees(insights.monthSpendPaise)} />
              <Text style={[styles.small, { color: colors.muted }]}>From saved refills</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Metric label="ALL-TIME FUEL SPEND" value={formatRupees(insights.allTimeSpendPaise)} />
              <Text style={[styles.small, { color: colors.muted }]}>{entries.length} {entries.length === 1 ? 'record' : 'records'}</Text>
            </Card>
          </View>

          <Card style={{ backgroundColor: colors.surfaceRaised }}>
            <Text style={[styles.kicker, { color: colors.accent }]}>FULL-TANK EFFICIENCY</Text>
            {insights.latestMileage ? (
              <>
                <View style={styles.efficiencyRow}>
                  <Text style={[styles.efficiencyValue, { color: colors.text }]}>{insights.latestMileage.efficiencyKmPerUnit.toFixed(1)}</Text>
                  <Text style={[styles.efficiencyUnit, { color: colors.muted }]}>km/{insights.latestMileage.quantityUnit === 'kg' ? 'kg' : 'L'}</Text>
                </View>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {insights.latestMileage.distanceKm.toLocaleString('en-IN')} km across recorded refills · {formatRupees(Math.round(insights.latestMileage.costPerKmRupees * 100))}/km
                </Text>
              </>
            ) : (
              <Text style={[styles.body, { color: colors.muted }]}>Mileage appears after two full-tank refills and the refills between them are recorded.</Text>
            )}
          </Card></>}

          {vehicleSection === 'records' && <>{!isElectric ? <AppButton label="＋  Record a refill" onPress={() => router.push('/fuel/new')} /> : null}
          <View style={styles.listHeading}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Refill history</Text>
            <Text style={[styles.small, { color: colors.muted }]}>Newest first</Text>
          </View>

          {entries.length === 0 ? (
            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>No refills recorded</Text>
              <Text style={[styles.body, { color: colors.muted }]}>Add the next refill with its odometer reading, quantity, and amount paid. Your saved entries stay on this device.</Text>
            </Card>
          ) : (
            <View style={styles.entryList}>
              {[...entries].reverse().map((entry) => {
                const segment = segmentByEndEntry.get(entry.id);
                return (
                  <Card key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryTop}>
                      <View style={styles.entryTitleBlock}>
                        <Text style={[styles.entryDate, { color: colors.text }]}>{formatFuelDate(entry.refuelled_at)}</Text>
                        <Text style={[styles.small, { color: colors.muted }]}>{entry.odometer_km.toLocaleString('en-IN')} km on odometer{entry.recorded_fuel_type ? ` · ${entry.recorded_fuel_type.toUpperCase()}` : ''}</Text>
                      </View>
                      <View style={[styles.fillBadge, { backgroundColor: entry.is_full_tank ? colors.accentSoft : colors.surfaceRaised }]}>
                        <Text style={[styles.fillBadgeText, { color: entry.is_full_tank ? colors.accent : colors.muted }]}>{entry.is_full_tank ? 'FULL TANK' : 'PARTIAL'}</Text>
                      </View>
                    </View>
                    <View style={styles.moneyRow}>
                      <Text style={[styles.entryQuantity, { color: colors.text }]}>{formatFuelQuantity(entry.quantity_milliunits, entry.quantity_unit)}</Text>
                      <Text style={[styles.entryCost, { color: colors.text }]}>{formatRupees(entry.cost_paise)}</Text>
                    </View>
                    {segment ? (
                      <View style={[styles.mileageNote, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.mileageNoteText, { color: colors.accent }]}>
                          {segment.efficiencyKmPerUnit.toFixed(1)} km/{segment.quantityUnit === 'kg' ? 'kg' : 'L'} over {segment.distanceKm.toLocaleString('en-IN')} km since the previous full tank
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.entryActions, { borderTopColor: colors.border }]}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Edit refill from ${formatFuelDate(entry.refuelled_at)}`} onPress={() => router.push(`/fuel/${entry.id}/edit`)}>
                        <Text style={[styles.actionLink, { color: colors.accent }]}>Edit</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Delete refill from ${formatFuelDate(entry.refuelled_at)}`} onPress={() => confirmDelete(entry)}>
                        <Text style={[styles.actionLink, { color: colors.danger }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}</>}

          <Text style={[styles.disclaimer, { color: colors.muted }]}>Mileage uses only recorded quantities between consecutive full-tank entries. Missing refill records can make the result inaccurate.</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 14, gap: 6 },
  small: { fontSize: 11 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 20 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  efficiencyRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  efficiencyValue: { fontSize: 36, fontWeight: '900' },
  efficiencyUnit: { fontSize: 15, fontWeight: '700' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryList: { gap: 12 },
  entryCard: { padding: 15, gap: 12 },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  entryTitleBlock: { flex: 1, gap: 4 },
  entryDate: { fontSize: 14, fontWeight: '800' },
  fillBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  fillBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  moneyRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  entryQuantity: { fontSize: 18, fontWeight: '800' },
  entryCost: { fontSize: 17, fontWeight: '800' },
  mileageNote: { borderRadius: 9, padding: 10 },
  mileageNoteText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  entryActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11 },
  actionLink: { fontSize: 13, fontWeight: '800' },
  disclaimer: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
