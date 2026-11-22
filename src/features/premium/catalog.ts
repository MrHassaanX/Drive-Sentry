export const checkedOn = '21 November 2026';

export const grades = {
  xp100: { name: 'XP100', company: 'IndianOil', octane: 100, url: 'https://iocl.com/xp100',
    description: 'High-octane petrol. IndianOil publishes a grade-specific outlet roster.' },
  xp95: { name: 'XP95', company: 'IndianOil', octane: 95, url: 'https://iocl.com/pages/XP95',
    description: 'Premium petrol with a published 95 RON specification.' },
  speed: { name: 'SPEED', company: 'Bharat Petroleum', octane: null,
    url: 'https://www.bharatpetroleum.in/our-businesses/fuels-and-services/about-fuels-and-services.aspx',
    description: 'BPCL markets SPEED as premium petrol. The cited page gives no numeric RON for standard SPEED.' },
  speed97: { name: 'SPEED 97', company: 'Bharat Petroleum', octane: 97,
    url: 'https://www.bharatpetroleum.in/our-businesses/fuels-and-services/speed-97',
    description: 'High-octane petrol designed for vehicles that specify higher octane.' },
  speed100: { name: 'SPEED 100', company: 'Bharat Petroleum', octane: 100,
    url: 'https://www.bharatpetroleum.in/images/files/jwaladhwani-february-2026-updated.pdf',
    description: 'BPCL announced the launch of this 100-octane petrol at India Energy Week 2026.' },
  power: { name: 'poWer', company: 'Hindustan Petroleum', octane: null,
    url: 'https://www.hindustanpetroleum.com/pages/petrol',
    description: 'Check HPCL for the current poWer offering and specification at the outlet.' },
  power99: { name: 'poWer99', company: 'Hindustan Petroleum', octane: 99,
    url: 'https://www.hindustanpetroleum.com/pages/power99',
    description: 'HPCL documents poWer99 as branded petrol rated at 99 octane.' },
  power100: { name: 'poWer100', company: 'Hindustan Petroleum', octane: 100,
    url: 'https://www.hindustanpetroleum.com/power100?lang=hindi',
    description: 'HPCL publishes a 100 RON specification and an outlet roster. Additive details do not establish the composition of the finished petrol.' },
} as const;

export type Grade = keyof typeof grades;
export type PremiumFilter = 'premium' | 'stations' | 'e0' | 'speed-family' | Grade;

export const premiumFilters: { id: PremiumFilter; label: string }[] = [
  { id: 'premium', label: 'All premium grades' },
  { id: 'e0', label: 'Verified E0 only' },
  { id: 'xp100', label: 'XP100' },
  { id: 'xp95', label: 'XP95' },
  { id: 'speed-family', label: 'SPEED grades' },
  { id: 'speed100', label: 'SPEED 100' },
  { id: 'power', label: 'poWer' },
  { id: 'power99', label: 'poWer99' },
  { id: 'power100', label: 'poWer100' },
  { id: 'stations', label: 'All stations' },
];

export const officialLookups = [
  { label: 'IndianOil XP100 outlets', url: grades.xp100.url },
  { label: 'BPCL fuel and outlet information', url: grades.speed97.url },
  { label: 'HPCL poWer100 outlets', url: grades.power100.url },
];

export const labSampleReference = {
  publisher: 'Autocar India',
  date: '22 September 2025',
  url: 'https://www.autocarindia.com/auto-features/how-much-ethanol-is-in-your-petrol-437339',
  samples: {
    XP95: '19.88% ethanol',
    XP100: 'less than 0.20% ethanol',
  } as Partial<Record<string, string>>,
};
