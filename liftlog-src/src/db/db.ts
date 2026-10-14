import Dexie, { type Table } from 'dexie';
import type {
  BodyWeightEntry, ExerciseDef, RecordEntry, Session, SetEntry, Settings, TimerState, WorkoutTemplate,
} from '../types';

export const DB_NAME = 'liftlog';

export class LiftlogDB extends Dexie {
  exercises!: Table<ExerciseDef, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<Session, string>;
  sets!: Table<SetEntry, string>;
  bodyweight!: Table<BodyWeightEntry, string>;
  records!: Table<RecordEntry, string>;
  settings!: Table<Settings, string>;
  timer!: Table<TimerState, string>;

  constructor(name = DB_NAME) {
    super(name);

    // v1: first public schema.
    this.version(1).stores({
      exercises: 'id, name, primary, archived',
      templates: 'id, order',
      sessions: 'id, status, startedAt, templateId',
      sets: 'id, sessionId, exerciseId',
      bodyweight: 'id, date',
      records: 'id, exerciseId',
      settings: 'id',
      timer: 'id',
    });

    // v2: adds a compound index for fast per-exercise lookups inside a session and
    // normalises rows written by v1 (missing kind / rir / snapshots).
    this.version(2)
      .stores({
        sets: 'id, sessionId, exerciseId, [sessionId+exerciseUid]',
      })
      .upgrade(async (tx) => {
        await tx.table('sets').toCollection().modify((s: Partial<SetEntry>) => {
          if (s.kind !== 'warmup') s.kind = 'working';
          if (s.rir === undefined) s.rir = null;
          if (s.weightKg === undefined) s.weightKg = null;
          if (s.reps === undefined) s.reps = null;
        });
        await tx.table('sessions').toCollection().modify((s: Partial<Session>) => {
          s.exercises = (s.exercises ?? []).map((e) => ({
            ...e,
            secondarySnapshot: e.secondarySnapshot ?? [],
            loadModeSnapshot: e.loadModeSnapshot ?? 'external',
            perHandSnapshot: e.perHandSnapshot ?? false,
            notes: e.notes ?? '',
          }));
          if (s.notes === undefined) s.notes = '';
        });
      });
  }
}

export let db = new LiftlogDB();

/** For tests: swap in a fresh database instance. */
export function replaceDb(name: string): LiftlogDB {
  db = new LiftlogDB(name);
  return db;
}
