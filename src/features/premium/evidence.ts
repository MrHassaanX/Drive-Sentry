import type { Station } from '../stations/provider.ts';
import { grades, type Grade, type PremiumFilter } from './catalog.ts';

type MappedGrade = Grade | 'octane95' | 'octane97' | 'octane98' | 'octane99' | 'octane100' | 'unspecified';
type EvidenceSource = {
  url: string;
  publisher: string;
  sourceRecordId: string;
  verifiedOn: string | null;
};

export type GradeEvidence = {
  stationId: string;
  grade: MappedGrade;
  availability: 'official' | 'community';
  source: EvidenceSource;
  retrievedAt: string;
  // Product evidence needs an explicit outlet-specific link to the same formulation.
  composition?: EvidenceSource & { ethanol: 'e0'; scope: 'outlet' | 'product'; outletGradeRecordId: string };
  communityE0Claim?: boolean;
};

const tagGrades: Record<string, MappedGrade> = {
  'fuel:xp95': 'xp95', 'fuel:xp100': 'xp100',
  'fuel:speed': 'speed', 'fuel:speed97': 'speed97', 'fuel:speed_97': 'speed97',
  'fuel:speed100': 'speed100', 'fuel:speed_100': 'speed100',
  'fuel:power': 'power', 'fuel:power99': 'power99', 'fuel:power_99': 'power99',
  'fuel:power100': 'power100', 'fuel:power_100': 'power100',
  'fuel:octane_95': 'octane95', 'fuel:octane_97': 'octane97', 'fuel:octane_98': 'octane98',
  'fuel:octane_99': 'octane99', 'fuel:octane_100': 'octane100',
};

export function communityEvidence(station: Station, retrievedAt: string): GradeEvidence[] {
  const tags = station.fuelTags?.map(tag => tag.toLowerCase()) ?? [];
  const mappedGrades = new Set<MappedGrade>();
  for (const tag of tags) {
    if (Object.hasOwn(tagGrades, tag)) mappedGrades.add(tagGrades[tag]);
  }
  const communityE0Claim = tags.includes('fuel:e0') || tags.includes('fuel:ethanol_free');
  if (communityE0Claim) mappedGrades.add('unspecified');
  const osmSource = !!station.osmRef || station.source === 'OpenStreetMap';
  return [...mappedGrades].map(grade => ({
    stationId: station.id, grade, availability: 'community', retrievedAt,
    communityE0Claim: grade === 'unspecified',
    source: {
      url: station.osmRef ? 'https://www.openstreetmap.org/' + station.osmRef
        : osmSource ? 'https://www.openstreetmap.org/copyright' : 'https://apidocs.geoapify.com/docs/places/',
      publisher: osmSource ? 'OpenStreetMap contributors' : 'Geoapify source tags',
      sourceRecordId: station.osmRef ?? station.id,
      verifiedOn: null,
    },
  }));
}

export function gradeName(grade: MappedGrade) {
  if (grade === 'unspecified') return 'Mapped ethanol-free claim';
  if (grade in grades) return grades[grade as Grade].name;
  return grade.slice('octane'.length) + ' octane · brand unspecified';
}

function recentProof(source: EvidenceSource, grade: Grade, now: number) {
  const officialHost = new URL(grades[grade].url).hostname.replace(/^www\./, '');
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || (url.hostname !== officialHost && url.hostname !== 'www.' + officialHost) ||
      source.publisher !== grades[grade].company || !source.sourceRecordId ||
      !source.verifiedOn || !/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedOn)) return false;
  const verified = Date.parse(source.verifiedOn);
  return Number.isFinite(verified) && new Date(verified).toISOString().slice(0, 10) === source.verifiedOn &&
    now >= verified && now - verified <= 180 * 86400000;
}

export function verifiedE0(item: GradeEvidence, now = Date.now()) {
  if (item.availability !== 'official' || !Object.hasOwn(grades, item.grade)) return false;
  const grade = item.grade as Grade;
  return recentProof(item.source, grade, now) &&
    item.composition?.ethanol === 'e0' &&
    (item.composition.scope === 'outlet' || item.composition.scope === 'product') &&
    item.composition.outletGradeRecordId === item.source.sourceRecordId && recentProof(item.composition, grade, now);
}

export function evidenceForStation(station: Station, evidence: readonly GradeEvidence[]) {
  // Proximity and similar names cannot attach evidence from one pump to another.
  const matched = evidence.filter(item => item.stationId === station.id);
  return [...new Map(matched.map(item => [
    JSON.stringify([item.grade, item.availability, item.source.publisher, item.source.sourceRecordId]), item,
  ])).values()];
}

export function matchesPremium(filter: PremiumFilter, evidence: readonly GradeEvidence[], now = Date.now()) {
  if (filter === 'stations') return true;
  if (filter === 'e0') return evidence.some(item => verifiedE0(item, now));
  if (filter === 'premium') return evidence.some(item => item.grade !== 'unspecified');
  if (filter === 'speed-family') return evidence.some(item => item.grade === 'speed' || item.grade === 'speed97' || item.grade === 'speed100');
  return evidence.some(item => item.grade === filter);
}
