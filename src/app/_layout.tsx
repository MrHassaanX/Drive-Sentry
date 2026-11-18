import { useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View, StyleSheet } from 'react-native';

import { SelectedVehicleProvider } from '../context/SelectedVehicleContext';
import { migrateDbIfNeeded } from '../db/migrations';
import { AppButton } from '../components/ui';
import { useAppTheme } from '../hooks/useAppTheme';

export { ErrorBoundary } from 'expo-router';

function DatabaseError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.errorScreen, { backgroundColor: colors.background }]}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>DriveSentry couldn’t open your garage</Text>
      <Text style={[styles.errorBody, { color: colors.muted }]}>{message}</Text>
      <AppButton label="Try again" onPress={onRetry} />
    </View>
  );
}

export default function RootLayout() {
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const handleDatabaseError = useCallback((error: Error) => {
    // The provider reports an initialization error during render.
    setTimeout(() => setDatabaseError(error.message), 0);
  }, []);

  return (
    <SafeAreaProvider>
      {databaseError ? (
        <DatabaseError
          message={databaseError}
          onRetry={() => setDatabaseError(null)}
        />
      ) : (
        <SQLiteProvider databaseName="drivesentry.db" onInit={migrateDbIfNeeded} onError={handleDatabaseError}>
          <SelectedVehicleProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="vehicles/new" />
              <Stack.Screen name="vehicles/[id]/index" />
              <Stack.Screen name="vehicles/[id]/edit" />
              <Stack.Screen name="fuel/new" />
              <Stack.Screen name="fuel/[id]/edit" />
              <Stack.Screen name="maintenance/new" />
              <Stack.Screen name="maintenance/[id]/edit" />
              <Stack.Screen name="maintenance/schedule/new" />
              <Stack.Screen name="maintenance/schedule/[id]/edit" />
            </Stack>
          </SelectedVehicleProvider>
        </SQLiteProvider>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  errorTitle: { fontSize: 24, fontWeight: '800' },
  errorBody: { fontSize: 15, lineHeight: 22 },
});
