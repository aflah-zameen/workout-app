import { db } from './db';
import { buildExercises, buildSettings, buildTemplates } from '../data/seed';
import { computeRecords } from '../engine/records';
import { BACKUP_APP, BACKUP_SCHEMA, MUSCLES } from '../types';
import type {
  BodyWeightEntry, ExerciseDef, Session, SetEntry, Settings, WorkoutTemplate,
} from '../types';

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: {
    exercises: ExerciseDef[];
    templates: WorkoutTemplate[];
    sessions: Session[];
    sets: SetEntry[];
    bodyweight: BodyWeightEntry[];
    settings: Settings | null;
  };
}

export async function exportBackup(): Promise<BackupFile> {
  const [exercises, templates, sessions, sets, bodyweight, settings] = await Promise.all([
    db.exercises.toArray(), db.templates.toArray(), db.sessions.toArray(), db.sets.toArray(),
    db.bodyweight.toArray(), db.settings.get('settings'),
  ]);
  return {
    app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA, exportedAt: new Date().toISOString(),
    data: { exercises, templates, sessions, sets, bodyweight, settings: settings ?? null },
  };
}

// ---------- validation ---------------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || v === undefined || isNum(v);

export class BackupError extends Error {}

export interface ValidatedBackup { data: BackupFile['data']; warnings: string[]; counts: Record<string, number> }

/** Migrate older backup shapes forward. Throws BackupError when the file cannot be used. */
export function migrateBackup(raw: unknown): BackupFile {
  if (!isObj(raw)) throw new BackupError('This file is not a Liftlog backup (expected a JSON object).');
  if (raw.app !== BACKUP_APP) throw new BackupError('This file is not a Liftlog backup (missing app marker).');
  const v = raw.schemaVersion;
  if (!isNum(v) || v < 1) throw new BackupError('The backup has no valid schema version.');
  if (v > BACKUP_SCHEMA) throw new BackupError(`This backup was made by a newer version of Liftlog (schema ${v}). Update the app and try again.`);
  if (!isObj(raw.data)) throw new BackupError('The backup contains no data section.');
  const d = raw.data as Record<string, unknown>;
  const arr = (k: string) => (d[k] === undefined ? [] : d[k]);
  for (const k of ['exercises', 'templates', 'sessions', 'sets', 'bodyweight']) {
    if (!Array.isArray(arr(k))) throw new BackupError(`Backup field "${k}" must be a list.`);
  }
  // v1 -> v2: sessions/sets gained defaulted fields.
  const sessions = (arr('sessions') as Session[]).map((s) => ({
    ...s,
    notes: s.notes ?? '',
    exercises: (s.exercises ?? []).map((e) => ({
      ...e, secondarySnapshot: e.secondarySnapshot ?? [], loadModeSnapshot: e.loadModeSnapshot ?? 'external',
      perHandSnapshot: e.perHandSnapshot ?? false, notes: e.notes ?? '',
    })),
  }));
  const sets = (arr('sets') as SetEntry[]).map((s) => ({ ...s, kind: s.kind === 'warmup' ? 'warmup' as const : 'working' as const, rir: s.rir ?? null, weightKg: s.weightKg ?? null, reps: s.reps ?? null }));
  return {
    app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA, exportedAt: String(raw.exportedAt ?? ''),
    data: {
      exercises: arr('exercises') as ExerciseDef[], templates: arr('templates') as WorkoutTemplate[], sessions, sets,
      bodyweight: arr('bodyweight') as BodyWeightEntry[], settings: (isObj(d.settings) ? d.settings : null) as Settings | null,
    },
  };
}

export function validateBackup(raw: unknown): ValidatedBackup {
  const file = migrateBackup(raw);
  const { exercises, templates, sessions, sets, bodyweight } = file.data;
  const warnings: string[] = [];
  const fail = (m: string): never => { throw new BackupError(m); };

  const dupes = (items: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) fail(`Duplicate ${label} id "${it.id}" inside the backup.`);
      seen.add(it.id);
    }
  };

  exercises.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.name)) fail(`Exercise #${i + 1} is missing an id or name.`);
    if (!MUSCLES.includes(e.primary)) fail(`Exercise "${e.name}" has an unknown primary muscle "${String(e.primary)}".`);
    if (!isNum(e.incrementKg) || e.incrementKg <= 0) fail(`Exercise "${e.name}" has an invalid increment.`);
    if (!['external', 'bodyweight', 'assisted'].includes(e.loadMode)) fail(`Exercise "${e.name}" has an invalid load mode.`);
  });
  templates.forEach((t, i) => {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.name) || !Array.isArray(t.exercises)) fail(`Workout plan #${i + 1} is malformed.`);
    t.exercises.forEach((x) => {
      if (!isStr(x.exerciseId) || !isNum(x.sets) || !isNum(x.repMin) || !isNum(x.repMax)) fail(`Workout plan "${t.name}" has an invalid exercise row.`);
    });
  });
  sessions.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isNum(s.startedAt) || !Array.isArray(s.exercises)) fail(`Session #${i + 1} is malformed.`);
    if (s.status !== 'active' && s.status !== 'completed') fail(`Session ${s.id} has an invalid status.`);
    s.exercises.forEach((e) => { if (!isStr(e.uid) || !isStr(e.exerciseId)) fail(`Session ${s.id} contains an invalid exercise entry.`); });
  });
  const sessionIds = new Set(sessions.map((s) => s.id));
  sets.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isStr(s.sessionId) || !isStr(s.exerciseUid) || !isStr(s.exerciseId)) fail(`Set #${i + 1} is malformed.`);
    if (!isNumOrNull(s.weightKg) || !isNumOrNull(s.reps) || !isNumOrNull(s.rir)) fail(`Set ${s.id} has non-numeric weight, reps or RIR.`);
    if ((s.weightKg ?? 0) < 0 || (s.reps ?? 0) < 0 || (s.reps ?? 0) > 1000) fail(`Set ${s.id} has an impossible weight or rep count.`);
    if (typeof s.completed !== 'boolean') fail(`Set ${s.id} is missing its completed flag.`);
  });
  bodyweight.forEach((b, i) => {
    if (!isObj(b) || !isStr(b.id) || !isStr(b.date) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !isNum(b.kg) || b.kg <= 0 || b.kg > 700) fail(`Body-weight entry #${i + 1} is invalid.`);
  });
  dupes(exercises, 'exercise'); dupes(templates, 'plan'); dupes(sessions, 'session'); dupes(sets, 'set'); dupes(bodyweight, 'body-weight entry');

  const orphan = sets.filter((s) => !sessionIds.has(s.sessionId));
  if (orphan.length) warnings.push(`${orphan.length} set(s) belong to sessions that are not in the backup and will be skipped.`);

  return {
    data: file.data, warnings,
    counts: { exercises: exercises.length, plans: templates.length, sessions: sessions.length, sets: sets.length, bodyWeight: bodyweight.length },
  };
}

export interface ImportResult { added: number; updated: number; skipped: number }

/** merge: keeps existing data, adds new records, newer `updatedAt` wins. replace: wipes first. */
export async function importBackup(raw: unknown, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const { data } = validateBackup(raw);
  const sessionIds = new Set(data.sessions.map((s) => s.id));
  const sets = data.sets.filter((s) => sessionIds.has(s.sessionId));
  const result: ImportResult = { added: 0, updated: 0, skipped: data.sets.length - sets.length };

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const t of db.tables) await t.clear();
    }
    const putAll = async <T extends { id: string; updatedAt?: number }>(table: { get(id: string): Promise<T | undefined>; put(v: T): Promise<unknown> }, rows: T[]) => {
      for (const r of rows) {
        const cur = await table.get(r.id);
        if (!cur) { await table.put(r); result.added++; }
        else if ((r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { await table.put(r); result.updated++; }
        else result.skipped++;
      }
    };
    await putAll(db.exercises, data.exercises);
    await putAll(db.templates, data.templates);
    await putAll(db.sessions, data.sessions);
    await putAll(db.sets, sets);
    // Body weight is unique per day: merge by date.
    for (const b of data.bodyweight) {
      const cur = await db.bodyweight.where('date').equals(b.date).first();
      if (!cur) { await db.bodyweight.put(b); result.added++; }
      else if (b.updatedAt > cur.updatedAt) { await db.bodyweight.put({ ...b, id: cur.id }); result.updated++; }
      else result.skipped++;
    }
    if (data.settings && (mode === 'replace' || !(await db.settings.get('settings')))) {
      await db.settings.put({ ...buildSettings(Date.now()), ...data.settings, id: 'settings' });
    }
    // Guarantee a usable library even when importing a minimal file.
    if ((await db.exercises.count()) === 0) await db.exercises.bulkPut(buildExercises(Date.now()));
    if ((await db.templates.count()) === 0) await db.templates.bulkPut(buildTemplates(Date.now()));
    if (!(await db.settings.get('settings'))) await db.settings.put(buildSettings(Date.now()));
  });

  const [sessions, allSets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const recs = computeRecords(sessions, allSets);
  await db.transaction('rw', db.records, async () => { await db.records.clear(); await db.records.bulkPut(recs); });
  return result;
}

export function backupFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `liftlog-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
