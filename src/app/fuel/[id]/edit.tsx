import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { InlineMessage, Screen } from '../../../components/ui';
import { useSelectedVehicle } from '../../../context/SelectedVehicleContext';
import { getVehicle } from '../../../features/vehicles/repository';
import type { Vehicle } from '../../../features/vehicles/types';
import { getFuelEntry } from '../../../features/fuel/repository';
import { FuelEntryEditor } from '../../../features/fuel/FuelEntryEditor';
import type { FuelEntry } from '../../../features/fuel/types';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function EditFuelEntryScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const { selectedVehicle, isLoading } = useSelectedVehicle();
  if (isLoading) return <Screen><ActivityIndicator /></Screen>;
  if (!selectedVehicle) return <Screen><InlineMessage>Select a vehicle before editing a fuel record.</InlineMessage><Link href="/(tabs)/vehicles">My Vehicles</Link></Screen>;
  return <FuelEntryRoute key={`${selectedVehicle.id}:${id}`} id={id} vehicleId={selectedVehicle.id} />;
}

function FuelEntryRoute({ id, vehicleId }: { id: number; vehicleId: number }) {
  const database = useSQLiteContext();
  const { colors } = useAppTheme();
  const [entry, setEntry] = useState<FuelEntry | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!Number.isSafeInteger(id) || id < 1) return () => { active = false; };
    void Promise.all([getFuelEntry(database, id, vehicleId), getVehicle(database, vehicleId)]).then(([result, owner]) => {
      if (!active) return;
      setEntry(result);
      setVehicle(owner);
    }).catch(() => {
      if (active) setHasError(true);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [database, id, vehicleId]);

  if (!Number.isSafeInteger(id) || id < 1) return <Screen><InlineMessage tone="error">This fuel record link is not valid.</InlineMessage><Link href="/(tabs)/fuel" style={{ color: colors.accent }}>Back to Fuel</Link></Screen>;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.accent} /></View>;
  if (hasError) return <Screen><InlineMessage tone="error">This fuel record could not be loaded.</InlineMessage><Link href="/(tabs)/fuel" style={{ color: colors.accent }}>Back to Fuel</Link></Screen>;
  if (!entry || !vehicle) return <Screen><InlineMessage tone="error">This fuel record is no longer available.</InlineMessage><Link href="/(tabs)/fuel" style={{ color: colors.accent }}>Back to Fuel</Link></Screen>;
  return <FuelEntryEditor entry={entry} associatedVehicle={vehicle} />;
}
