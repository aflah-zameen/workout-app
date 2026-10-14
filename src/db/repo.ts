import { db } from './db';
import { buildExercises, buildSettings, buildTemplates } from '../data/seed';
import { computeRecords } from '../engine/records';
import { buildExerciseHistory } from '../engine/history';
import { uid } from '../lib/util';
import type {
  BodyWeightEntry, ExerciseDef, Feedback, Session, SessionExercise, SetEntry, Settings, TemplateExercise, TimerState, WorkoutTemplate,
} from '../types';

// ---------- bootstrap ----------------------------------------------------------------------
export async function ensureSeeded(): Promise<void> {
  const at = Date.now();
  await db.transaction('rw', [db.settings, db.exercises, db.templates], async () => {
    if (await db.settings.get('settings')) return;
    await db.exercises.bulkPut(buildExercises(at));
    await db.templates.bulkPut(buildTemplates(at));
    await db.settings.put(buildSettings(at));
  });
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return s ?? buildSettings(Date.now());
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...buildSettings(0), ...cur, ...patch, id: 'settings', updatedAt: Date.now() });
}

// ---------- sessions ------------------------------------------------------------------------
export function snapshotExercise(ex: ExerciseDef, te: Pick<TemplateExercise, 'sets' | 'repMin' | 'repMax' | 'restSec'>, settings: Settings): SessionExercise {
  return {
    uid: uid(), exerciseId: ex.id, nameSnapshot: ex.name, muscleSnapshot: ex.primary, secondarySnapshot: [...ex.secondary],
    loadModeSnapshot: ex.loadMode, perHandSnapshot: ex.perHand, targetSets: te.sets, repMin: te.repMin, repMax: te.repMax,
    restSec: te.restSec ?? ex.restSec ?? (ex.compound ? settings.restCompoundSec : settings.restIsolationSec),
    notes: '',
  };
}

function blankSet(sessionId: string, ex: SessionExercise, index: number, kind: 'working' | 'warmup', weightKg: number | null, at: number): SetEntry {
  return {
    id: uid(), sessionId, exerciseUid: ex.uid, exerciseId: ex.exerciseId, index, kind, weightKg, reps: null, rir: null,
    completed: false, createdAt: at, updatedAt: at,
  };
}

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('active').first();
}

export async function startSession(
  templateId: string | null, opts: { feedback?: Feedback; deload?: boolean; name?: string } = {},
): Promise<Session> {
  const existing = await getActiveSession();
  if (existing) return existing;
  const settings = await getSettings();
  const tpl = templateId ? await db.templates.get(templateId) : undefined;
  const at = Date.now();
  const exMap = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const exercises: SessionExercise[] = [];
  for (const te of tpl?.exercises ?? []) {
    const def = exMap.get(te.exerciseId);
    if (def) exercises.push(snapshotExercise(def, te, settings));
  }
  const session: Session = {
    id: uid(), templateId: tpl?.id ?? null, name: opts.name ?? tpl?.name ?? 'Custom workout', focus: tpl?.focus ?? '',
    status: 'active', startedAt: at, exercises, notes: '', feedback: opts.feedback, deload: opts.deload,
    createdAt: at, updatedAt: at,
  };
  const [allSessions, allSets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const rows: SetEntry[] = [];
  for (const ex of exercises) rows.push(...prefillSets(session.id, ex, allSessions, allSets, at, settings.planned ?? {}));
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    await db.sessions.put(session);
    await db.sets.bulkPut(rows);
  });
  return session;
}

/** Build the planned set rows for an exercise, prefilled with last session's loads. */
export function prefillSets(sessionId: string, ex: SessionExercise, sessions: Session[], sets: SetEntry[], at: number, planned: Record<string, number> = {}): SetEntry[] {
  const prev = buildExerciseHistory(sessions, sets, ex.exerciseId, { excludeSessionId: sessionId })[0];
  const rows: SetEntry[] = [];
  for (let i = 0; i < ex.targetSets; i++) {
    const p = prev?.working[i] ?? prev?.working[prev.working.length - 1];
    const approved = planned[ex.exerciseId];
    rows.push(blankSet(sessionId, ex, i, 'working', approved ?? p?.weightKg ?? null, at));
  }
  return rows;
}

export async function saveSet(set: SetEntry): Promise<void> {
  await db.sets.put({ ...set, updatedAt: Date.now() });
  await db.sessions.update(set.sessionId, { updatedAt: Date.now() });
}

export async function addSet(sessionId: string, ex: SessionExercise, kind: 'working' | 'warmup', weightKg: number | null, reps: number | null = null): Promise<SetEntry> {
  const existing = await db.sets.where('[sessionId+exerciseUid]').equals([sessionId, ex.uid]).toArray();
  const sameKind = existing.filter((s) => s.kind === kind);
  const index = kind === 'warmup' ? -1000 + sameKind.length : sameKind.length; // warm-ups sort before working sets
  const row = { ...blankSet(sessionId, ex, index, kind, weightKg, Date.now()), reps };
  await db.sets.put(row);
  return row;
}

export async function removeSet(id: string): Promise<void> {
  await db.sets.delete(id);
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  await db.sessions.update(id, { ...patch, updatedAt: Date.now() });
}

export async function updateSessionExercise(sessionId: string, uidv: string, patch: Partial<SessionExercise>): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    s.exercises = s.exercises.map((e) => (e.uid === uidv ? { ...e, ...patch } : e));
    s.updatedAt = Date.now();
    await db.sessions.put(s);
  });
}

export async function addExerciseToSession(sessionId: string, exerciseId: string): Promise<void> {
  const [ex, settings, sess] = await Promise.all([db.exercises.get(exerciseId), getSettings(), db.sessions.get(sessionId)]);
  if (!ex || !sess) return;
  const se = snapshotExercise(ex, { sets: 3, repMin: 8, repMax: 12 }, settings);
  const [allSessions, allSets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const rows = prefillSets(sessionId, se, allSessions, allSets, Date.now(), settings.planned ?? {});
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    sess.exercises = [...sess.exercises, se];
    sess.updatedAt = Date.now();
    await db.sessions.put(sess);
    await db.sets.bulkPut(rows);
  });
}

/** Swap an exercise for an alternative. Only allowed while nothing has been completed for it. */
export async function swapExercise(sessionId: string, exUid: string, newExerciseId: string): Promise<boolean> {
  const [newEx, settings, sess] = await Promise.all([db.exercises.get(newExerciseId), getSettings(), db.sessions.get(sessionId)]);
  if (!newEx || !sess) return false;
  const old = sess.exercises.find((e) => e.uid === exUid);
  if (!old) return false;
  const rows = await db.sets.where('[sessionId+exerciseUid]').equals([sessionId, exUid]).toArray();
  if (rows.some((r) => r.completed)) return false;
  const swapped = snapshotExercise(newEx, { sets: old.targetSets, repMin: old.repMin, repMax: old.repMax }, settings);
  swapped.uid = old.uid;
  swapped.swappedFrom = old.swappedFrom ?? old.exerciseId;
  swapped.notes = old.notes;
  const [allSessions, allSets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const fresh = prefillSets(sessionId, swapped, allSessions, allSets, Date.now(), settings.planned ?? {});
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    sess.exercises = sess.exercises.map((e) => (e.uid === exUid ? swapped : e));
    sess.updatedAt = Date.now();
    await db.sessions.put(sess);
    await db.sets.bulkDelete(rows.map((r) => r.id));
    await db.sets.bulkPut(fresh);
  });
  return true;
}

export async function removeExerciseFromSession(sessionId: string, exUid: string): Promise<boolean> {
  const rows = await db.sets.where('[sessionId+exerciseUid]').equals([sessionId, exUid]).toArray();
  if (rows.some((r) => r.completed)) return false;
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    s.exercises = s.exercises.filter((e) => e.uid !== exUid);
    await db.sessions.put({ ...s, updatedAt: Date.now() });
    await db.sets.bulkDelete(rows.map((r) => r.id));
  });
  return true;
}

export async function rebuildRecords(): Promise<void> {
  const [sessions, sets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const recs = computeRecords(sessions, sets);
  await db.transaction('rw', db.records, async () => {
    await db.records.clear();
    await db.records.bulkPut(recs);
  });
}

export interface FinishInfo { discardedSets: number; completedSets: number }

export async function countUnfinished(sessionId: string): Promise<FinishInfo> {
  const rows = await db.sets.where('sessionId').equals(sessionId).toArray();
  return { discardedSets: rows.filter((r) => !r.completed).length, completedSets: rows.filter((r) => r.completed).length };
}

/** Marks the session complete. Un-logged placeholder rows are removed (the caller confirms first). */
export async function finishSession(sessionId: string, at = Date.now()): Promise<Session | undefined> {
  const sess = await db.sessions.get(sessionId);
  if (!sess) return undefined;
  const rows = await db.sets.where('sessionId').equals(sessionId).toArray();
  const keep = new Set(rows.filter((r) => r.completed).map((r) => r.exerciseUid));
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    await db.sets.bulkDelete(rows.filter((r) => !r.completed).map((r) => r.id));
    await db.sessions.put({
      ...sess, status: 'completed', finishedAt: at, durationSec: Math.max(0, Math.round((at - sess.startedAt) / 1000)),
      exercises: sess.exercises.filter((e) => keep.has(e.uid)), updatedAt: at,
    });
  });
  await rebuildRecords();
  // Approved load changes were used; clear them for exercises that were actually performed.
  const settings = await getSettings();
  const planned = { ...(settings.planned ?? {}) };
  for (const e of sess.exercises) if (keep.has(e.uid)) delete planned[e.exerciseId];
  await updateSettings({ planned, ...(sess.deload ? { lastDeloadAt: at } : {}) });
  return db.sessions.get(sessionId);
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    await db.sets.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
  await rebuildRecords();
}

/** Copy a past session into a new active session (sets uncompleted, loads prefilled from the copy). */
export async function duplicateSession(id: string): Promise<Session | undefined> {
  if (await getActiveSession()) return undefined;
  const src = await db.sessions.get(id);
  if (!src) return undefined;
  const at = Date.now();
  const sets = await db.sets.where('sessionId').equals(id).toArray();
  const newId = uid();
  const uidMap = new Map<string, string>();
  const exercises = src.exercises.map((e) => { const nu = uid(); uidMap.set(e.uid, nu); return { ...e, uid: nu }; });
  const copy: Session = { ...src, id: newId, status: 'active', startedAt: at, finishedAt: undefined, durationSec: undefined, exercises, feedback: undefined, notes: '', createdAt: at, updatedAt: at };
  const rows: SetEntry[] = sets.map((s) => ({
    ...s, id: uid(), sessionId: newId, exerciseUid: uidMap.get(s.exerciseUid) ?? s.exerciseUid, reps: null, rir: null,
    completed: false, completedAt: undefined, createdAt: at, updatedAt: at,
  }));
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    await db.sessions.put(copy);
    await db.sets.bulkPut(rows);
  });
  return copy;
}

export async function discardSession(id: string): Promise<void> {
  await deleteSession(id);
}

// ---------- templates ----------------------------------------------------------------------------
export async function saveTemplate(t: WorkoutTemplate): Promise<void> {
  await db.templates.put({ ...t, updatedAt: Date.now() });
}

export async function createTemplate(name: string): Promise<WorkoutTemplate> {
  const at = Date.now();
  const count = await db.templates.count();
  const t: WorkoutTemplate = { id: uid(), name, focus: '', exercises: [], order: count, createdAt: at, updatedAt: at };
  await db.templates.put(t);
  return t;
}

export async function deleteTemplate(id: string): Promise<void> {
  const settings = await getSettings();
  await db.transaction('rw', [db.templates, db.settings], async () => {
    await db.templates.delete(id);
    await db.settings.put({ ...settings, schedule: settings.schedule.map((s) => (s === id ? null : s)), updatedAt: Date.now() });
  });
  // Past sessions keep their own snapshot, so history is untouched.
}

// ---------- exercises ----------------------------------------------------------------------------
export async function saveExercise(ex: ExerciseDef): Promise<void> {
  await db.exercises.put({ ...ex, updatedAt: Date.now() });
}

export function newCustomExercise(name: string, patch: Partial<ExerciseDef> = {}): ExerciseDef {
  const at = Date.now();
  return {
    id: 'custom_' + uid(), name, primary: 'chest', secondary: [], equipment: '', compound: false, loadMode: 'external',
    perHand: false, incrementKg: 2.5, restSec: 90, alternatives: [], custom: true, archived: false, createdAt: at, updatedAt: at, ...patch,
  };
}

// ---------- body weight ------------------------------------------------------------------------
export async function saveBodyWeight(entry: Omit<BodyWeightEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  const at = Date.now();
  const existing = await db.bodyweight.where('date').equals(entry.date).first();
  const id = entry.id ?? existing?.id ?? uid();
  await db.bodyweight.put({ id, date: entry.date, kg: entry.kg, createdAt: existing?.createdAt ?? at, updatedAt: at });
}

export async function deleteBodyWeight(id: string): Promise<void> {
  await db.bodyweight.delete(id);
}

// ---------- timer ------------------------------------------------------------------------------------
export const getTimer = () => db.timer.get('timer');
export const saveTimer = (t: TimerState) => db.timer.put(t);
export const clearTimer = () => db.timer.delete('timer');

// ---------- reset ---------------------------------------------------------------------------------------
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await ensureSeeded();
}
