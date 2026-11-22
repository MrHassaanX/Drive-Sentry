import { useColorScheme } from 'react-native';

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const dark = systemScheme === 'dark';
  return {
    dark,
    colors: dark
      ? {
          background: '#0B111C',
          surface: '#131D2B',
          surfaceRaised: '#1C2A3B',
          text: '#F4F7F8',
          muted: '#A6B1BA',
          border: '#303D50',
          accent: '#68DEB1',
          accentText: '#09231D',
          accentSoft: '#183B32',
          danger: '#FF8C88',
          dangerSoft: '#3A2022',
        }
      : {
          background: '#F6F5F0',
          surface: '#FFFEFB',
          surfaceRaised: '#EEEFEA',
          text: '#142130',
          muted: '#515F68',
          border: '#DEE3DC',
          accent: '#087653',
          accentText: '#FFFFFF',
          accentSoft: '#DDF2EC',
          danger: '#B83C3A',
          dangerSoft: '#FCE7E5',
        },
  };
}
