import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../hooks/useAppTheme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.screenContent}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  const backgroundColor =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.dangerSoft : variant === 'secondary' ? colors.surfaceRaised : 'transparent';
  const textColor = variant === 'primary' ? colors.accentText : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: variant === 'ghost' ? 'transparent' : colors.border, opacity: disabled ? 0.55 : pressed ? 0.82 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>}
    </Pressable>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border, color: colors.text }, props.style]}
      />
      {error ? <Text style={[styles.fieldError, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.choice, { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.border }]}
            >
              <Text style={[styles.choiceText, { color: selected ? colors.accent : colors.muted }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  const { colors } = useAppTheme();
  return (
    <View>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}{suffix ? <Text style={styles.metricSuffix}> {suffix}</Text> : null}</Text>
    </View>
  );
}

export function InlineMessage({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.message, { backgroundColor: tone === 'error' ? colors.dangerSoft : colors.accentSoft }]}>
      <Text style={{ color: tone === 'error' ? colors.danger : colors.text, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function LoadingState({ label = 'Loading your garage…' }: { label?: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.muted }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  screenContent: { flexGrow: 1, padding: 20, paddingBottom: 32, gap: 18 },
  heading: { gap: 5, marginTop: 4 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 },
  button: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  fieldWrap: { gap: 7 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 15 },
  fieldError: { fontSize: 12 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  choiceText: { fontSize: 13, fontWeight: '700' },
  metricLabel: { fontSize: 12, fontWeight: '600' },
  metricValue: { fontSize: 28, fontWeight: '800', marginTop: 3 },
  metricSuffix: { fontSize: 14, fontWeight: '600' },
  message: { borderRadius: 12, padding: 13 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
});
