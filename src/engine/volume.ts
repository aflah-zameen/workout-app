import type { ExerciseDef, Muscle, Session, SetEntry, WorkoutTemplate } from '../types';
import { MUSCLES } from '../types';

export const INDIRECT_WEIGHT = 0.5;

export type MuscleSets = Record<Muscle, number>;
export const emptyMuscleSets = (): MuscleSets =>
  Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleSets;

/** Completed working sets per muscle in [from, to). Primary counts 1, secondary counts 0.5. */
export function effectiveSets(sessions: Session[], sets: SetEntry[], from: number, to: number): MuscleSets {
  const out = emptyMuscleSets();
  const sMap = new Map(sessions.filter((s) => s.status === 'completed' && s.startedAt >= from && s.startedAt < to).map((s) => [s.id, s]));
  for (const st of sets) {
    if (!st.completed || st.kind !== 'working') continue;
    const sess = sMap.get(st.sessionId);
    if (!sess) continue;
    const ex = sess.exercises.find((e) => e.uid === st.exerciseUid);
    if (!ex) continue;
    out[ex.muscleSnapshot] += 1;
    for (const m of ex.secondarySnapshot) out[m] += INDIRECT_WEIGHT;
  }
  return out;
}

/** Planned effective sets per week from the scheduled templates. */
export function plannedWeeklySets(
  schedule: (string | null)[], templates: WorkoutTemplate[], exercises: Map<string, ExerciseDef>,
): MuscleSets {
  const out = emptyMuscleSets();
  const tMap = new Map(templates.map((t) => [t.id, t]));
  for (const id of schedule) {
    const t = id ? tMap.get(id) : null;
    if (!t) continue;
    for (const te of t.exercises) {
      const ex = exercises.get(te.exerciseId);
      if (!ex) continue;
      out[ex.primary] += te.sets;
      for (const m of ex.secondary) out[m] += te.sets * INDIRECT_WEIGHT;
    }
  }
  return out;
}

/** Rough, widely-used hypertrophy ranges for hard weekly sets. Shown as guidance, not rules. */
export const VOLUME_BANDS = { low: 6, high: 20, excessive: 24 };

export function volumeLabel(sets: number): 'low' | 'moderate' | 'high' | 'very high' {
  if (sets < VOLUME_BANDS.low) return 'low';
  if (sets <= VOLUME_BANDS.high) return 'moderate';
  if (sets <= VOLUME_BANDS.excessive) return 'high';
  return 'very high';
}

export function estimateDurationSec(
  template: WorkoutTemplate, exercises: Map<string, ExerciseDef>, defaults: { compound: number; isolation: number },
): number {
  let t = 300; // warm-up and setup
  for (const te of template.exercises) {
    const ex = exercises.get(te.exerciseId);
    const rest = te.restSec ?? ex?.restSec ?? (ex?.compound ? defaults.compound : defaults.isolation);
    t += te.sets * (45 + rest);
    if (ex?.compound) t += 150; // warm-up sets
  }
  return t;
}

/** Same counting rules as effectiveSets, but keeps direct and indirect work apart for display. */
export function muscleSetsSplit(sessions: Session[], sets: SetEntry[], from: number, to: number): { direct: MuscleSets; indirect: MuscleSets } {
  const direct = emptyMuscleSets();
  const indirect = emptyMuscleSets();
  const sMap = new Map(sessions.filter((s) => s.status === 'completed' && s.startedAt >= from && s.startedAt < to).map((s) => [s.id, s]));
  for (const st of sets) {
    if (!st.completed || st.kind !== 'working') continue;
    const sess = sMap.get(st.sessionId);
    const ex = sess?.exercises.find((e) => e.uid === st.exerciseUid);
    if (!ex) continue;
    direct[ex.muscleSnapshot] += 1;
    for (const m of ex.secondarySnapshot) indirect[m] += INDIRECT_WEIGHT;
  }
  return { direct, indirect };
}
