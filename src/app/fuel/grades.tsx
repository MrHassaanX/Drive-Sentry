import { Linking, Text } from 'react-native';
import { router } from 'expo-router';
import { AppButton, Card, InlineMessage, PageHeading, Screen } from '../../components/ui';
import { checkedOn, grades, labSampleReference, officialLookups } from '../../features/premium/catalog';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function FuelGradeGuide() {
  const { colors } = useAppTheme();
  function openSource(url: string) {
    void Linking.openURL(url).catch(() => {});
  }
  return (
    <Screen>
      <AppButton label="Back to explorer" variant="ghost" onPress={() => router.back()} />
      <PageHeading title="Fuel-grade guide" subtitle="Check your vehicle manual for its required octane and allowed ethanol blend." />
      <InlineMessage>Octane describes knock resistance. Ethanol content and outlet stock need separate, current evidence.</InlineMessage>
      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Official outlet lookups</Text>
        {officialLookups.map(source => (
          <AppButton key={source.url} label={source.label} variant="secondary" onPress={() => openSource(source.url)} />
        ))}
      </Card>
      {Object.values(grades).map(grade => (
        <Card key={grade.name}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{grade.name}</Text>
          <Text style={{ color: colors.text }}>{grade.company} · {grade.octane ? grade.octane + ' RON' : 'Numeric octane unavailable in cited source'}</Text>
          <Text style={{ color: colors.text }}>{grade.description}</Text>
          <Text style={{ color: colors.muted }}>Current outlet ethanol content unknown · Official source checked {checkedOn}</Text>
          {labSampleReference.samples[grade.name] && (
            <Text accessibilityRole="link" style={{ color: colors.accent }} onPress={() => openSource(labSampleReference.url)}>
              Mumbai lab sample · {labSampleReference.samples[grade.name]} · {labSampleReference.publisher}, {labSampleReference.date}
            </Text>
          )}
          <AppButton label={'Official ' + grade.name + ' source'} variant="ghost" onPress={() => openSource(grade.url)} />
        </Card>
      ))}
    </Screen>
  );
}
