import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { isMetroCity, type CityId, type PriceResult } from './model';
import { loadPrices } from './service';

export function useFuelPrices() {
  const database = useSQLiteContext();
  const [cityId, setCityId] = useState<CityId>('mysuru');
  const [request, setRequest] = useState({ force: false });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isMetroCity(cityId)) return;
    let active = true;
    void loadPrices(database, request.force).then(next => {
      if (active) setResult(next);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Metro prices are unavailable.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [database, cityId, request]);

  function selectCity(next: CityId) {
    if (next === cityId) return;
    setCityId(next);
    setRequest({ force: false });
    setError('');
    setLoading(isMetroCity(next));
  }

  function refresh() {
    if (loading || !isMetroCity(cityId)) return;
    setError('');
    setLoading(true);
    setRequest({ force: true });
  }

  return { cityId, selectCity, refresh, result, error, loading };
}
