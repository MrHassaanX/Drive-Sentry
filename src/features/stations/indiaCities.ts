import type { SearchPlace } from './geocoding.ts';

// City centres are explicit planning origins. They never replace a device fix.
const centres = {
  mysuru: ['Mysuru', 'Karnataka', 12.3052, 76.6552],
  pune: ['Pune', 'Maharashtra', 18.5204, 73.8567],
  bengaluru: ['Bengaluru', 'Karnataka', 12.9716, 77.5946],
  delhi: ['Delhi', 'Delhi', 28.6139, 77.2090],
  mumbai: ['Mumbai', 'Maharashtra', 19.0760, 72.8777],
  chennai: ['Chennai', 'Tamil Nadu', 13.0827, 80.2707],
  kolkata: ['Kolkata', 'West Bengal', 22.5726, 88.3639],
  hyderabad: ['Hyderabad', 'Telangana', 17.3850, 78.4867],
  ahmedabad: ['Ahmedabad', 'Gujarat', 23.0225, 72.5714],
  jaipur: ['Jaipur', 'Rajasthan', 26.9124, 75.7873],
  lucknow: ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462],
  chandigarh: ['Chandigarh', 'Chandigarh', 30.7333, 76.7794],
  amritsar: ['Amritsar', 'Punjab', 31.6340, 74.8723],
  dehradun: ['Dehradun', 'Uttarakhand', 30.3165, 78.0322],
  srinagar: ['Srinagar', 'Jammu and Kashmir', 34.0837, 74.7973],
  varanasi: ['Varanasi', 'Uttar Pradesh', 25.3176, 82.9739],
  patna: ['Patna', 'Bihar', 25.5941, 85.1376],
  ranchi: ['Ranchi', 'Jharkhand', 23.3441, 85.3096],
  bhubaneswar: ['Bhubaneswar', 'Odisha', 20.2961, 85.8245],
  guwahati: ['Guwahati', 'Assam', 26.1445, 91.7362],
  shillong: ['Shillong', 'Meghalaya', 25.5788, 91.8933],
  imphal: ['Imphal', 'Manipur', 24.8170, 93.9368],
  agartala: ['Agartala', 'Tripura', 23.8315, 91.2868],
  indore: ['Indore', 'Madhya Pradesh', 22.7196, 75.8577],
  raipur: ['Raipur', 'Chhattisgarh', 21.2514, 81.6296],
  nagpur: ['Nagpur', 'Maharashtra', 21.1458, 79.0882],
  panaji: ['Panaji', 'Goa', 15.4909, 73.8278],
  kochi: ['Kochi', 'Kerala', 9.9312, 76.2673],
  thiruvananthapuram: ['Thiruvananthapuram', 'Kerala', 8.5241, 76.9366],
  coimbatore: ['Coimbatore', 'Tamil Nadu', 11.0168, 76.9558],
  visakhapatnam: ['Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185],
} as const;

export type PlanningCity = keyof typeof centres;
export const indiaCities = Object.entries(centres).map(([id, [name, state, latitude, longitude]]) => ({
  id: id as PlanningCity, name, state, latitude, longitude, label: name + ', ' + state,
}));

export function indiaCityPlace(id: string): SearchPlace | undefined {
  const city = indiaCities.find(entry => entry.id === id);
  if (city) return { id: city.id, label: city.label, latitude: city.latitude, longitude: city.longitude, via: 'map' };
}
