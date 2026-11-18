export function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatFuelQuantity(milliunits: number, unit: 'litre' | 'kg'): string {
  const amount = (milliunits / 1000).toFixed(3).replace(/\.?0+$/, '');
  return `${amount} ${unit === 'kg' ? 'kg' : 'L'}`;
}

export function formatFuelDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
