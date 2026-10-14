import { snapKg } from '../lib/units';
import type { Unit } from '../types';

/** Simple ramp-up: ~50% x8, 70% x5, 85% x3 of the working weight, snapped to loadable values. */
export function warmupRamp(workingKg: number, unit: Unit, incrementKg: number): { weightKg: number; reps: number }[] {
  if (!(workingKg > 0)) return [];
  const steps: [number, number][] = [[0.5, 8], [0.7, 5], [0.85, 3]];
  const out: { weightKg: number; reps: number }[] = [];
  for (const [pct, reps] of steps) {
    const w = snapKg(workingKg * pct, unit, incrementKg);
    if (w > 0 && w < workingKg && !out.some((o) => o.weightKg === w)) out.push({ weightKg: w, reps });
  }
  return out;
}
