import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { InlineMessage, Screen } from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { getVehicle } from '../../../features/vehicles/repository';
import type { Vehicle } from '../../../features/vehicles/types';
import { VehicleEditor } from '../../../features/vehicles/VehicleEditor';

export default function EditVehicleScreen() {
  const database = useSQLiteContext();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const { colors } = useAppTheme();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!Number.isSafeInteger(id) || id < 1) return () => { active = false; };
    void getVehicle(database, id).then((result) => {
      if (active) setVehicle(result);
    }).catch(() => {
      if (active) setHasError(true);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [database, id]);

  if (!Number.isSafeInteger(id) || id < 1) return <Screen><InlineMessage tone="error">This vehicle link is not valid.</InlineMessage><Link href="/(tabs)/vehicles" style={{ color: colors.accent }}>Back to My Vehicles</Link></Screen>;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.accent} /></View>;
  if (hasError) return <Screen><InlineMessage tone="error">This vehicle could not be loaded.</InlineMessage><Link href="/(tabs)/vehicles" style={{ color: colors.accent }}>Back to My Vehicles</Link></Screen>;
  if (!vehicle) return <Screen><InlineMessage tone="error">This vehicle was not found on this device.</InlineMessage><Link href="/(tabs)/vehicles" style={{ color: colors.accent }}>Back to My Vehicles</Link></Screen>;
  return <VehicleEditor vehicle={vehicle} />;
}
