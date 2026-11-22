import { stationReferences } from './identity.ts';
import type { Station } from './provider.ts';

const mappedTags = {
  Petrol: /^fuel:(?:petrol|gasoline|octane_\d+|xp(?:95|100)|speed(?:_?(?:97|100))?|power(?:_?(?:99|100))?)$/i,
  Diesel: /^fuel:diesel(?:_gtl)?$/i,
};

export function stationSupportsFuel(station: Station, fuel: keyof typeof mappedTags) {
  return station.outletListing?.products.some(product => product.fuel === fuel.toLowerCase()) ||
    stationReferences(station).some(ref => ref.fuelTags?.some(tag => mappedTags[fuel].test(tag)));
}
