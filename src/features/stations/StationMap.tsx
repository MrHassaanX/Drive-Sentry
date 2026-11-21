import { StyleSheet, View } from 'react-native';
import { InlineMessage } from '../../components/ui';
import type { StationMapProps } from './mapTypes';

export default function StationMap(_props: StationMapProps) {
  return (
    <View style={styles.message}>
      <InlineMessage>Open the interactive map on Android or iOS. Station results are available in List on web.</InlineMessage>
    </View>
  );
}

const styles = StyleSheet.create({ message: { flex: 1 } });
