import type { LoadMode, RecordEntry, RecordType, Session, SetEntry } from '../types';
import { estimate1RM } from './history';

export interface RecordEvent {
  exerciseId: string;
  type: RecordType;
  value: number;
  reps: number;
  weightKg: number;
  sessionId: string;
  at: number;
  previous: number | null;
}

/** Walk completed working sets chronologically and emit an event each time a best is beaten. */
export function recordEvents(sessions: Session[], sets: SetEntry[]): RecordEvent[] {
  const sMap = new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
  const rows = sets
    .filter((s) => s.completed && s.kind === 'working' && s.reps != null && s.reps > 0 && sMap.has(s.sessionId))
    .sort((a, b) => {
      const sa = sMap.get(a.sessionId)!.startedAt, sb = sMap.get(b.sessionId)!.startedAt;
      return sa - sb || (a.completedAt ?? a.updatedAt) - (b.completedAt ?? b.updatedAt) || a.index - b.index;
    });
  const best = new Map<string, number>();
  const events: RecordEvent[] = [];
  const consider = (s: SetEntry, type: RecordType, value: number | null) => {
    if (value == null || !(value > 0)) return;
    const key = `${s.exerciseId}:${type}`;
    const prev = best.get(key);
    if (prev === undefined || value > prev + 1e-9) {
      best.set(key, value);
      events.push({
        exerciseId: s.exerciseId, type, value, reps: s.reps ?? 0, weightKg: s.weightKg ?? 0,
        sessionId: s.sessionId, at: s.completedAt ?? s.updatedAt, previous: prev ?? null,
      });
    }
  };
  for (const s of rows) {
    const sess = sMap.get(s.sessionId)!;
    const ex = sess.exercises.find((e) => e.uid === s.exerciseUid);
    const mode: LoadMode = ex?.loadModeSnapshot ?? 'external';
    const w = s.weightKg ?? 0, r = s.reps ?? 0;
    if (mode === 'external') {
      consider(s, 'weight', w);
      consider(s, 'e1rm', estimate1RM(w, r));
      consider(s, 'setVolume', w * r);
    } else if (mode === 'bodyweight') {
      consider(s, 'reps', r);
      consider(s, 'weight', w); // added load only counts when > 0
    } else {
      consider(s, 'reps', r);
    }
  }
  return events;
}

export function computeRecords(sessions: Session[], sets: SetEntry[]): RecordEntry[] {
  const latest = new Map<string, RecordEvent>();
  for (const e of recordEvents(sessions, sets)) latest.set(`${e.exerciseId}:${e.type}`, e);
  return [...latest.entries()].map(([id, e]) => ({
    id, exerciseId: e.exerciseId, type: e.type, value: e.value, reps: e.reps, weightKg: e.weightKg,
    sessionId: e.sessionId, achievedAt: e.at, updatedAt: Date.now(),
  }));
}

/** New personal records set in one session (excludes first-time baselines). */
export function sessionPRs(sessionId: string, sessions: Session[], sets: SetEntry[]): RecordEvent[] {
  return recordEvents(sessions, sets).filter((e) => e.sessionId === sessionId && e.previous != null && e.type !== 'setVolume');
}
