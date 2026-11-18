import { useColorScheme } from 'react-native';

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const dark = systemScheme === 'dark';
  return {
    dark,
    colors: dark
      ? {
          background: '#0B131A',
          surface: '#141F29',
          surfaceRaised: '#1A2934',
          text: '#F4F7F8',
          muted: '#A6B1BA',
          border: '#2B3944',
          accent: '#64D6B7',
          accentText: '#09231D',
          accentSoft: '#183B32',
          danger: '#FF8C88',
          dangerSoft: '#3A2022',
        }
      : {
          background: '#F3F6F7',
          surface: '#FFFFFF',
          surfaceRaised: '#E9EFF1',
          text: '#10212B',
          muted: '#62747D',
          border: '#DDE6E8',
          accent: '#087D69',
          accentText: '#FFFFFF',
          accentSoft: '#DDF2EC',
          danger: '#B83C3A',
          dangerSoft: '#FCE7E5',
        },
  };
}
