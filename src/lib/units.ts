import type { Unit } from '../types';

export const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Round to a stable canonical precision so repeated conversions never drift. */
export const canon = (kg: number) => Math.round(kg * 10000) / 10000;

export function toDisplay(kg: number, unit: Unit): number {
  const v = unit === 'kg' ? kg : kgToLb(kg);
  return Math.round(v * 100) / 100;
}

/** Parse what the user typed in their unit into canonical kg. */
export function fromDisplay(value: number, unit: Unit): number {
  return canon(unit === 'kg' ? value : lbToKg(value));
}

export function fmtWeight(kg: number | null | undefined, unit: Unit, withUnit = false): string {
  if (kg == null || Number.isNaN(kg)) return '–';
  const v = toDisplay(kg, unit);
  const s = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  return withUnit ? `${s} ${unit}` : s;
}

/** Increment shown to the user: kg stays as defined, lb gets rounded to practical plates. */
export function incrementFor(kg: number, unit: Unit): number {
  if (unit === 'kg') return kg;
  // Plates and dumbbell racks in lb move in 2.5 lb steps.
  return Math.max(2.5, Math.round(kgToLb(kg) / 2.5) * 2.5);
}

/** Snap a suggested kg value to something loadable in the display unit. */
export function snapKg(kg: number, unit: Unit, incrementKg: number): number {
  const step = incrementFor(incrementKg, unit);
  const disp = toDisplay(kg, unit);
  const snapped = Math.round(disp / step) * step;
  return fromDisplay(snapped, unit);
}
