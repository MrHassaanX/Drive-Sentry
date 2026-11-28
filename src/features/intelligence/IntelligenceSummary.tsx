import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton, Card } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { readServiceIntelligence } from './receiptRepository';
import { repairInsights } from './repairs';
import { listWarranties, warrantyExpiry } from './warranties';
import { expiryStatus } from '../ownership/dates';

export function IntelligenceSummary({ vehicleId }: { vehicleId?: number }) {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [summary, setSummary] = useState<{ vehicle: number; expiries: number; repeats: number }>();
  useFocusEffect(useCallback(() => {
    if (!vehicleId) return;
    let active = true;
    void Promise.all([listWarranties(db, vehicleId), readServiceIntelligence(db, vehicleId)]).then(([warranties, history]) => {
      if (!active) return;
      const expiries = warranties.filter(item => {
        const date = warrantyExpiry(item);
        return expiryStatus(date) === 'Expiring soon';
      }).length;
      const repeats = repairInsights(vehicleId, history.records, history.items, warranties, history.rule, history.dismissed).length;
      setSummary({ vehicle: vehicleId, expiries, repeats });
    }).catch(() => { if (active) setSummary(undefined); });
    return () => { active = false; };
  }, [db, vehicleId]));

  if (!summary || summary.vehicle !== vehicleId || (!summary.expiries && !summary.repeats)) return null;
  return <Card>
    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>Service and warranty</Text>
    {!!summary.expiries && <AppButton label={summary.expiries === 1 ? '1 warranty expiring within 30 days' : summary.expiries + ' warranties expiring within 30 days'}
      variant="secondary" onPress={() => router.push({ pathname: '/service-intelligence', params: { vehicle: String(vehicleId) } })} />}
    {!!summary.repeats && <AppButton label={summary.repeats === 1 ? '1 possible repeat repair' : summary.repeats + ' possible repeat repairs'}
      variant="secondary" onPress={() => router.push({ pathname: '/service-intelligence', params: { vehicle: String(vehicleId), section: 'repairs' } })} />}
  </Card>;
}
