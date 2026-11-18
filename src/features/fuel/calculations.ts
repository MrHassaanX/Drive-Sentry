import type { FuelEntry, FuelInsights, FuelEntryInput, MileageSegment } from './types';

export function compareFuelEntries(left: FuelEntry, right: FuelEntry): number {
  return left.refuelled_at.localeCompare(right.refuelled_at) || left.id - right.id;
}

export function localMonthKey(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function findOdometerSequenceError(
  entries: FuelEntry[],
  candidate: FuelEntryInput,
  editingId: number | null = null,
): string | null {
  const existing = entries.filter((entry) => entry.id !== editingId);
  const proposed: FuelEntry = {
    id: editingId ?? Number.MAX_SAFE_INTEGER,
    vehicle_id: candidate.vehicleId,
    refuelled_at: candidate.refuelledAt,
    odometer_km: candidate.odometerKm,
    quantity_milliunits: candidate.quantityMilliunits,
    quantity_unit: candidate.quantityUnit,
    cost_paise: candidate.costPaise,
    is_full_tank: candidate.isFullTank ? 1 : 0,
    created_at: '',
    updated_at: '',
  };
  const ordered = [...existing, proposed].sort(compareFuelEntries);

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].odometer_km < ordered[index - 1].odometer_km) {
      return 'Odometer readings must not go backwards over time. Check the date and earlier readings.';
    }
  }

  return null;
}

export function calculateMileageSegments(entries: FuelEntry[]): MileageSegment[] {
  const ordered = [...entries].sort(compareFuelEntries);
  const segments: MileageSegment[] = [];
  let previousFullIndex: number | null = null;

  ordered.forEach((current, currentIndex) => {
    if (current.is_full_tank !== 1) return;

    if (previousFullIndex !== null) {
      const previous = ordered[previousFullIndex];
      const distanceKm = current.odometer_km - previous.odometer_km;
      const intervalEntries = ordered.slice(previousFullIndex + 1, currentIndex + 1);
      let lastOdometer = previous.odometer_km;
      const odometerSequenceValid = intervalEntries.every((entry) => {
        const valid = entry.odometer_km >= lastOdometer;
        lastOdometer = entry.odometer_km;
        return valid;
      });
      const quantityMilliunits = intervalEntries.reduce((sum, entry) => sum + entry.quantity_milliunits, 0);
      const quantityUnit = intervalEntries[0]?.quantity_unit ?? current.quantity_unit;
      const unitConsistent = intervalEntries.every((entry) => entry.quantity_unit === quantityUnit);
      const costPaise = intervalEntries.reduce((sum, entry) => sum + entry.cost_paise, 0);

      if (distanceKm > 0 && odometerSequenceValid && unitConsistent && quantityMilliunits > 0) {
        segments.push({
          startEntryId: previous.id,
          endEntryId: current.id,
          startOdometerKm: previous.odometer_km,
          endOdometerKm: current.odometer_km,
          distanceKm,
          quantityMilliunits,
          quantityUnit,
          costPaise,
          efficiencyKmPerUnit: distanceKm * 1000 / quantityMilliunits,
          costPerKmRupees: costPaise / 100 / distanceKm,
          startDate: previous.refuelled_at,
          endDate: current.refuelled_at,
        });
      }
    }

    // A full fill begins the next interval, even if the interval before it was invalid.
    previousFullIndex = currentIndex;
  });

  return segments;
}

export function calculateFuelInsights(
  entries: FuelEntry[],
  monthKey: string,
): FuelInsights {
  const ordered = [...entries].sort(compareFuelEntries);
  const mileageSegments = calculateMileageSegments(ordered);
  return {
    entries: ordered,
    monthSpendPaise: ordered
      .filter((entry) => localMonthKey(entry.refuelled_at) === monthKey)
      .reduce((sum, entry) => sum + entry.cost_paise, 0),
    allTimeSpendPaise: ordered.reduce((sum, entry) => sum + entry.cost_paise, 0),
    latestMileage: mileageSegments.at(-1) ?? null,
    mileageSegments,
  };
}
