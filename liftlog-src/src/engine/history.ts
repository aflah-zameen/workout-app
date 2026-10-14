import type { LoadMode, Session, SessionExercise, SetEntry } from '../types';
import { avg, sum } from '../lib/util';

export interface ExerciseSessionHistory {
  sessionId: string;
  startedAt: number;
  sessionName: string;
  ex: SessionExercise;
  working: SetEntry[]; // completed working sets, ordered
  warmups: SetEntry[];
}

/** Epley estimate. Returns null when the data cannot support a meaningful estimate. */
export function estimate1RM(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || weightKg <= 0 || reps < 1 || reps > 10) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

const usable = (s: SetEntry) => s.completed && s.reps != null && s.reps > 0;

/** Group completed sets by session for one exercise, newest first. Excludes `excludeSessionId`. */
export function buildExerciseHistory(
  sessions: Session[],
  sets: SetEntry[],
  exerciseId: string,
  opts: { excludeSessionId?: string; onlyCompleted?: boolean } = {},
): ExerciseSessionHistory[] {
  const onlyCompleted = opts.onlyCompleted ?? true;
  const sMap = new Map(sessions.map((s) => [s.id, s]));
  const grouped = new Map<string, SetEntry[]>();
  for (const st of sets) {
    if (st.exerciseId !== exerciseId || !usable(st)) continue;
    if (opts.excludeSessionId && st.sessionId === opts.excludeSessionId) continue;
    const sess = sMap.get(st.sessionId);
    if (!sess || (onlyCompleted && sess.status !== 'completed')) continue;
    const key = st.sessionId + '|' + st.exerciseUid;
    const arr = grouped.get(key);
    if (arr) arr.push(st); else grouped.set(key, [st]);
  }
  const out: ExerciseSessionHistory[] = [];
  for (const [key, arr] of grouped) {
    const sess = sMap.get(key.split('|')[0])!;
    const ex = sess.exercises.find((e) => e.uid === arr[0].exerciseUid);
    if (!ex) continue;
    arr.sort((a, b) => a.index - b.index);
    const working = arr.filter((s) => s.kind === 'working');
    const warmups = arr.filter((s) => s.kind === 'warmup');
    if (!working.length) continue;
    out.push({ sessionId: sess.id, startedAt: sess.startedAt, sessionName: sess.name, ex, working, warmups });
  }
  out.sort((a, b) => b.startedAt - a.startedAt);
  return out;
}

export function topSet(sets: SetEntry[], mode: LoadMode): SetEntry | null {
  if (!sets.length) return null;
  const w = (s: SetEntry) => s.weightKg ?? 0;
  return [...sets].sort((a, b) => {
    if (mode === 'assisted') return w(a) - w(b) || (b.reps ?? 0) - (a.reps ?? 0);
    return w(b) - w(a) || (b.reps ?? 0) - (a.reps ?? 0);
  })[0];
}

export const totalReps = (sets: SetEntry[]) => sum(sets.map((s) => s.reps ?? 0));
export const volumeLoad = (sets: SetEntry[]) => sum(sets.map((s) => (s.weightKg ?? 0) * (s.reps ?? 0)));
export const avgWeight = (sets: SetEntry[]) => avg(sets.map((s) => s.weightKg ?? 0));

export function bestE1RM(sets: SetEntry[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const e = estimate1RM(s.weightKg, s.reps);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

export type Trend = 'up' | 'down' | 'same';

/** Compare the current session against the previous one for the same exercise. */
export function compareSessions(prev: SetEntry[], curr: SetEntry[], mode: LoadMode): Trend {
  if (!prev.length || !curr.length) return 'same';
  if (mode === 'external') {
    const pe = bestE1RM(prev) ?? volumeLoad(prev);
    const ce = bestE1RM(curr) ?? volumeLoad(curr);
    const eDelta = pe > 0 ? (ce - pe) / pe : 0;
    if (Math.abs(eDelta) > 0.025) return eDelta > 0 ? 'up' : 'down';
    const pv = volumeLoad(prev), cv = volumeLoad(curr);
    const vDelta = pv > 0 ? (cv - pv) / pv : 0;
    if (Math.abs(vDelta) > 0.05) return vDelta > 0 ? 'up' : 'down';
    return 'same';
  }
  const pw = avgWeight(prev), cw = avgWeight(curr);
  const wDiff = cw - pw;
  if (Math.abs(wDiff) > 0.25) {
    const better = mode === 'assisted' ? wDiff < 0 : wDiff > 0;
    return better ? 'up' : 'down';
  }
  const pr = totalReps(prev), cr = totalReps(curr);
  if (cr === pr) return 'same';
  return cr > pr ? 'up' : 'down';
}
