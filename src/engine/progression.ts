import type { ExerciseDef, LoadMode, SetEntry, Settings, Unit } from '../types';
import { fmtWeight, snapKg, toDisplay } from '../lib/units';
import { avg } from '../lib/util';
import { compareSessions, topSet, type ExerciseSessionHistory } from './history';

export type AdviceStatus = 'increase' | 'add_reps' | 'hold' | 'decline' | 'insufficient' | 'off';
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface ProgressionAdvice {
  exerciseId: string;
  status: AdviceStatus;
  headline: string;
  reasons: string[]; // the data behind the suggestion
  confidence: Confidence;
  suggestedWeightKg?: number;
  targetReps?: number;
  lastWeightKg?: number;
}

export interface AdviceInput {
  exercise: Pick<ExerciseDef, 'id' | 'name' | 'loadMode' | 'incrementKg' | 'perHand'>;
  repMin: number;
  repMax: number;
  targetSets: number;
  history: ExerciseSessionHistory[]; // newest first, completed sessions only
  settings: Pick<Settings, 'progressionEnabled' | 'sessionsAtTop' | 'minAvgRir' | 'rules'>;
  unit: Unit;
}

export const confidenceFor = (n: number): Confidence => (n <= 0 ? 'insufficient' : n === 1 ? 'low' : n === 2 ? 'medium' : 'high');

export function describeSets(sets: SetEntry[], unit: Unit, mode: LoadMode): string {
  return sets
    .map((s) => {
      if (mode === 'bodyweight' && !s.weightKg) return `BW×${s.reps}`;
      if (mode === 'bodyweight') return `BW+${fmtWeight(s.weightKg, unit)}×${s.reps}`;
      if (mode === 'assisted') return `−${fmtWeight(s.weightKg, unit)}×${s.reps}`;
      return `${fmtWeight(s.weightKg, unit)}×${s.reps}`;
    })
    .join(', ');
}

const rirOf = (sets: SetEntry[]) => {
  const v = sets.filter((s) => s.rir != null).map((s) => s.rir as number);
  return v.length ? avg(v) : null;
};

function atTop(h: ExerciseSessionHistory, repMax: number, targetSets: number): boolean {
  return h.working.length >= targetSets && h.working.every((s) => (s.reps ?? 0) >= repMax);
}

export function adviseProgression(inp: AdviceInput): ProgressionAdvice {
  const { exercise, repMin, repMax, targetSets, history, settings, unit } = inp;
  const rule = settings.rules[exercise.id];
  const base = { exerciseId: exercise.id } as const;

  if (!settings.progressionEnabled || rule?.mode === 'off') {
    return { ...base, status: 'off', headline: 'Progression suggestions are off for this exercise', reasons: [], confidence: 'insufficient' };
  }
  if (!history.length) {
    return {
      ...base, status: 'insufficient', confidence: 'insufficient',
      headline: 'No previous session yet',
      reasons: ['Log this exercise once and Liftlog will compare your next session against it.'],
    };
  }

  const mode = exercise.loadMode;
  const last = history[0];
  const lastTop = topSet(last.working, mode)!;
  const lastWeight = lastTop.weightKg ?? 0;
  const inc = rule?.incrementKg ?? exercise.incrementKg;
  const need = Math.max(1, rule?.sessionsAtTop ?? settings.sessionsAtTop);
  const reasons: string[] = [`Last session: ${describeSets(last.working, unit, mode)}.`];
  const conf = confidenceFor(history.length);
  const rir = rirOf(last.working);
  if (rir != null) reasons.push(`Average reps in reserve last time: ${rir.toFixed(1)}.`);

  // Decline detection needs three sessions (two consecutive drops).
  if (history.length >= 3) {
    const d1 = compareSessions(history[2].working, history[1].working, mode);
    const d2 = compareSessions(history[1].working, history[0].working, mode);
    if (d1 === 'down' && d2 === 'down') {
      return {
        ...base, status: 'decline', confidence: 'high', lastWeightKg: lastWeight,
        headline: 'Performance has dropped two sessions in a row',
        reasons: [
          ...reasons,
          `Earlier: ${describeSets(history[1].working, unit, mode)}; before that ${describeSets(history[2].working, unit, mode)}.`,
          'Check technique, rest between sets, sleep, food and overall fatigue before adding load. Repeat the same weight next time.',
        ],
      };
    }
  }

  const lastTrend = history.length >= 2 ? compareSessions(history[1].working, history[0].working, mode) : 'same';

  // Eligible for a load increase?
  const recent = history.slice(0, need);
  const eligible = recent.length >= need && recent.every((h) => atTop(h, repMax, targetSets));
  const sameLoad = recent.every((h) => Math.abs((topSet(h.working, mode)?.weightKg ?? 0) - lastWeight) <= Math.max(0.01, lastWeight * 0.005));

  if (eligible && sameLoad) {
    if (rir != null && rir < settings.minAvgRir) {
      return {
        ...base, status: 'hold', confidence: conf, lastWeightKg: lastWeight,
        headline: `Repeat ${fmtWeight(lastWeight, unit, true)} once more`,
        reasons: [
          ...reasons,
          `You reached ${repMax} reps on every set, but average reps in reserve (${rir.toFixed(1)}) is below your ${settings.minAvgRir} setting, so the sets were near failure.`,
          'Aim for about 1–3 reps in reserve before adding load.',
        ],
      };
    }
    const raw = mode === 'assisted' ? Math.max(0, lastWeight - inc) : lastWeight + inc;
    const next = snapKg(raw, unit, inc);
    if (mode === 'assisted' && next >= lastWeight) {
      return { ...base, status: 'hold', confidence: conf, lastWeightKg: lastWeight, headline: 'Already at minimum assistance', reasons };
    }
    const unitInc = toDisplay(Math.abs(next - lastWeight), unit);
    const verb = mode === 'assisted' ? 'Reduce assistance' : mode === 'bodyweight' && lastWeight === 0 ? 'Add weight' : 'Increase';
    reasons.push(
      `All ${last.working.length} working sets reached the top of the ${repMin}–${repMax} range${need > 1 ? ` in ${need} sessions in a row` : ''}.`,
      `Suggested change: ${mode === 'assisted' ? '−' : '+'}${unitInc} ${unit}${exercise.perHand ? ' per hand' : ''} — a small, practical step.`,
    );
    if (history.length === 1) reasons.push('Based on one session only, so treat this as a low-confidence suggestion.');
    return {
      ...base, status: 'increase', confidence: conf, lastWeightKg: lastWeight, suggestedWeightKg: next, targetReps: repMin,
      headline: `${verb} to ${fmtWeight(next, unit, true)}${exercise.perHand ? ' per hand' : ''}`,
      reasons,
    };
  }

  // Hold at weight and chase reps.
  const lowest = Math.min(...last.working.map((s) => s.reps ?? 0));
  const belowRange = last.working.filter((s) => (s.reps ?? 0) < repMin).length;
  if (belowRange > 0) {
    reasons.push(`${belowRange} set${belowRange > 1 ? 's' : ''} fell below ${repMin} reps. If this repeats, consider dropping one small increment or lengthening rest.`);
  }
  if (last.working.length < targetSets) reasons.push(`Only ${last.working.length} of ${targetSets} planned working sets were completed.`);
  if (lastTrend === 'down') reasons.push('Performance was lower than the session before; one off day is normal, so repeat the same weight.');
  const target = Math.min(repMax, Math.max(lowest + 1, repMin));
  return {
    ...base, status: lastTrend === 'down' ? 'hold' : 'add_reps', confidence: conf, lastWeightKg: lastWeight, targetReps: target,
    headline: `Keep ${fmtWeight(lastWeight, unit, true)}${exercise.perHand ? ' per hand' : ''} and aim for ${target}+ reps on every set`,
    reasons: [...reasons, `You add load once every set reaches ${repMax} reps (${need > 1 ? `${need} sessions` : '1 session'}).`],
  };
}
