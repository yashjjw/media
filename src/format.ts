import type { Vertical } from './types';

export const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
export const money2 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
export const num = (n: number) => Math.round(n).toLocaleString('en-US');
export const signed = (n: number, f: (x: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));

/** "a", "a and b", "a, b and c" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Short noun used in sentences like "travel, airline and insurance ads". */
export const VERTICAL_SHORT: Record<Vertical, string> = {
  travel: 'travel', airlines: 'airline', travel_insurance: 'insurance',
  beauty: 'beauty', food_delivery: 'food delivery', finance: 'finance',
};

export function publishedLabel(hours: number): string {
  if (hours === 0) return 'Published at event time';
  return `Published ${Math.round(hours / 24)} days before`;
}
