import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Text } from 'react-native';
import { AppButton, Card, InlineMessage, PageHeading, Screen, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { searchAddress, type SearchPlace } from './geocoding';

export default function AddressSearch({ onSelect, onClose }: {
  onSelect: (place: SearchPlace) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController>(undefined);
  useEffect(() => () => pending.current?.abort(), []);

  async function search() {
    if (pending.current) return;
    Keyboard.dismiss();
    setPlaces([]);
    setMessage('');
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const matches = await searchAddress(query, controller.signal);
      if (controller.signal.aborted) return;
      setPlaces(matches);
      if (!matches.length) setMessage('No matching locations in India. Add a district, state or PIN code.');
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Address search failed.');
    } finally {
      pending.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <Screen>
        <AppButton label="Close address search" variant="ghost" onPress={onClose} />
        <PageHeading title="Search city or address" />
        <Card>
          <TextField label="City or address in India" value={query} maxLength={160} editable={!busy}
            onChangeText={value => { setQuery(value); setPlaces([]); setMessage(''); }}
            returnKeyType="search" onSubmitEditing={() => void search()} />
          <Text style={{ color: colors.muted }}>Geoapify receives the address when you submit it.</Text>
          <AppButton label="Find locations" loading={busy} onPress={() => void search()} />
          {!!message && <InlineMessage>{message}</InlineMessage>}
        </Card>
        {places.map(place => <AppButton key={place.id} label={place.label} variant="secondary" onPress={() => onSelect(place)} />)}
      </Screen>
    </Modal>
  );
}
