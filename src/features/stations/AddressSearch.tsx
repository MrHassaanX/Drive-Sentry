import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Keyboard, Modal, Platform, Text } from 'react-native';
import { AppButton, Card, InlineMessage, PageHeading, Screen, TextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { createAcademicAddressSearch, searchAddress, type SearchPlace } from './geocoding';
import { indiaCities, indiaCityPlace } from './indiaCities';

const hasGeoapify = !!process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim();
const academicEndpoint = process.env.EXPO_PUBLIC_ACADEMIC_GEOCODER_URL?.trim();
const useAcademicGeocoder = !hasGeoapify && !!academicEndpoint && Platform.OS !== 'web' &&
  Constants.expoConfig?.extra?.buildProfile === 'academic-testing';
const lookup = useAcademicGeocoder ? createAcademicAddressSearch(academicEndpoint!) : searchAddress;

export default function AddressSearch({ onSelect, onClose }: {
  onSelect: (place: SearchPlace) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const cityQuery = query.trim().toLowerCase();
  const cities = indiaCities.filter(city => city.label.toLowerCase().includes(cityQuery) ||
    (city.id === 'mysuru' && cityQuery === 'mysore'));
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
      const matches = await lookup(query, controller.signal);
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
          <Text style={{ color: colors.muted }}>{useAcademicGeocoder ? 'The configured geocoder receives only the address you submit.'
            : hasGeoapify ? 'Geoapify receives the address when you submit it.' : 'Use GPS or search by moving the map.'}</Text>
          <AppButton label="Find locations" disabled={!useAcademicGeocoder && !hasGeoapify} loading={busy} onPress={() => void search()} />
          {!!message && <InlineMessage>{message}</InlineMessage>}
        </Card>
        {places.map(place => <AppButton key={place.id} label={place.label} variant="secondary" onPress={() => onSelect(place)} />)}
        {!!cities.length && <>
          <PageHeading title="Plan a stop in India" subtitle="Choose a city centre to search nearby. You can also move the map to any stop along your trip." />
          {cities.map(city => <AppButton key={city.id} label={city.label} variant="secondary" onPress={() => {
            const place = indiaCityPlace(city.id);
            if (place) onSelect(place);
          }} />)}
        </>}
      </Screen>
    </Modal>
  );
}
