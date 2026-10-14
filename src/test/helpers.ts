import type { LoadMode, Muscle, Session, SetEntry } from '../types';

let n = 0;
export interface FakeSessionOpts {
  id?: string; startedAt: number; exerciseId: string; name?: string; muscle?: Muscle; secondary?: Muscle[];
  mode?: LoadMode; repMin?: number; repMax?: number; targetSets?: number;
  sets: [number | null, number | null, (number | null)?][]; // [kg, reps, rir]
  kind?: 'working' | 'warmup'; templateId?: string | null; status?: 'active' | 'completed'; feedback?: Session['feedback'];
}

export function fakeSession(o: FakeSessionOpts): { session: Session; sets: SetEntry[] } {
  const id = o.id ?? `s${++n}`;
  const uid = `u-${id}-${o.exerciseId}`;
  const session: Session = {
    id, templateId: o.templateId ?? null, name: o.name ?? 'Test', focus: '', status: o.status ?? 'completed',
    startedAt: o.startedAt, finishedAt: o.startedAt + 3_600_000, durationSec: 3600, notes: '', feedback: o.feedback,
    exercises: [{
      uid, exerciseId: o.exerciseId, nameSnapshot: o.name ?? o.exerciseId, muscleSnapshot: o.muscle ?? 'chest',
      secondarySnapshot: o.secondary ?? [], loadModeSnapshot: o.mode ?? 'external', perHandSnapshot: false,
      targetSets: o.targetSets ?? o.sets.length, repMin: o.repMin ?? 6, repMax: o.repMax ?? 10, restSec: 120, notes: '',
    }],
    createdAt: o.startedAt, updatedAt: o.startedAt,
  };
  const sets: SetEntry[] = o.sets.map(([w, r, rir], i) => ({
    id: `${id}-set${i}`, sessionId: id, exerciseUid: uid, exerciseId: o.exerciseId, index: i, kind: o.kind ?? 'working',
    weightKg: w, reps: r, rir: rir ?? null, completed: true, completedAt: o.startedAt + i * 1000,
    createdAt: o.startedAt, updatedAt: o.startedAt,
  }));
  return { session, sets };
}

export const merge = (...parts: { session: Session; sets: SetEntry[] }[]) => ({
  sessions: parts.map((p) => p.session),
  sets: parts.flatMap((p) => p.sets),
});
