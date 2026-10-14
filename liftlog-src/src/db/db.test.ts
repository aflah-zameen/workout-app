import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiftlogDB, db, replaceDb } from './db';
import * as repo from './repo';
import { BackupError, exportBackup, importBackup, validateBackup } from './backup';
import { buildExerciseHistory } from '../engine/history';
import { fromDisplay } from '../lib/units';

let n = 0;
beforeEach(async () => {
  replaceDb(`liftlog-test-${++n}`);
  await repo.ensureSeeded();
});

async function logSession(templateId: string, weights: Record<number, number>, reps = 8) {
  const s = await repo.startSession(templateId);
  const rows = await db.sets.where('sessionId').equals(s.id).toArray();
  // rows come back in random-id order, so walk them exercise by exercise
  for (const [exIdx, ex] of s.exercises.entries()) {
    for (const r of rows.filter((x) => x.exerciseUid === ex.uid)) {
      await repo.saveSet({ ...r, weightKg: weights[exIdx] ?? r.weightKg ?? 20, reps, rir: 2, completed: true, completedAt: Date.now() });
    }
  }
  return repo.finishSession(s.id, Date.now() + 1000);
}

describe('seeding and persistence', () => {
  it('seeds the five-day plan, exercise library and settings once', async () => {
    expect(await db.templates.count()).toBe(5);
    expect(await db.exercises.count()).toBeGreaterThan(40);
    const s = await repo.getSettings();
    expect(s.schedule.filter(Boolean)).toHaveLength(5);
    await repo.ensureSeeded();
    expect(await db.templates.count()).toBe(5);
  });

  it('starts a session with a snapshot of every planned exercise and set row', async () => {
    const s = await repo.startSession('tpl_pull_a');
    expect(s.exercises).toHaveLength(6);
    const rows = await db.sets.where('sessionId').equals(s.id).toArray();
    expect(rows).toHaveLength(3 + 3 + 3 + 3 + 3 + 2);
    expect(rows.every((r) => !r.completed && r.kind === 'working')).toBe(true);
  });

  it('only allows one active session at a time', async () => {
    const a = await repo.startSession('tpl_pull_a');
    const b = await repo.startSession('tpl_push_a');
    expect(b.id).toBe(a.id);
  });

  it('recovers an unfinished workout after the app is closed and reopened', async () => {
    const s = await repo.startSession('tpl_push_a');
    const row = (await db.sets.where('sessionId').equals(s.id).toArray()).find((r) => r.exerciseUid === s.exercises[0].uid)!;
    await repo.saveSet({ ...row, weightKg: 30, reps: 9, rir: 2, completed: true, completedAt: Date.now() });
    await repo.updateSessionExercise(s.id, s.exercises[0].uid, { notes: 'felt strong' });
    await repo.saveTimer({ id: 'timer', durationSec: 150, startedAt: Date.now() - 20_000, remainingAtStart: 150, running: true, label: 'x', updatedAt: Date.now() });

    const name = db.name;
    db.close();
    replaceDb(name); // simulates a fresh page load against the same IndexedDB

    const recovered = await repo.getActiveSession();
    expect(recovered?.id).toBe(s.id);
    expect(recovered?.exercises[0].notes).toBe('felt strong');
    const saved = await db.sets.get(row.id);
    expect(saved).toMatchObject({ weightKg: 30, reps: 9, completed: true });
    expect((await repo.getTimer())?.running).toBe(true);
  });

  it('prefills the next session with the previous session’s loads (previous-session values)', async () => {
    await logSession('tpl_pull_a', { 0: 20, 1: 50 });
    const second = await repo.startSession('tpl_pull_a');
    const rows = await db.sets.where('sessionId').equals(second.id).toArray();
    const firstEx = second.exercises[0];
    expect(rows.filter((r) => r.exerciseUid === firstEx.uid).map((r) => r.weightKg)).toEqual([20, 20, 20]);
    const all = await db.sessions.toArray();
    const hist = buildExerciseHistory(all, await db.sets.toArray(), firstEx.exerciseId);
    expect(hist).toHaveLength(1);
    expect(hist[0].working.map((s) => s.reps)).toEqual([8, 8, 8]);
  });

  it('finishing discards only un-logged placeholder rows and rebuilds records', async () => {
    const s = await repo.startSession('tpl_pull_a');
    const rows = await db.sets.where('sessionId').equals(s.id).toArray();
    await repo.saveSet({ ...rows[0], weightKg: 10, reps: 8, completed: true, completedAt: Date.now() });
    const info = await repo.countUnfinished(s.id);
    expect(info).toEqual({ discardedSets: rows.length - 1, completedSets: 1 });
    const done = await repo.finishSession(s.id);
    expect(done?.status).toBe('completed');
    expect(done?.exercises).toHaveLength(1);
    expect(await db.sets.where('sessionId').equals(s.id).count()).toBe(1);
    expect((await db.records.toArray()).length).toBeGreaterThan(0);
  });

  it('keeps old workout names after an exercise is renamed', async () => {
    const done = await logSession('tpl_push_a', { 0: 30 });
    const ex = (await db.exercises.get('incline_db_press'))!;
    await repo.saveExercise({ ...ex, name: 'Incline DB press (renamed)' });
    const sess = (await db.sessions.get(done!.id))!;
    expect(sess.exercises[0].nameSnapshot).toBe('Incline dumbbell press');
    expect((await db.exercises.get('incline_db_press'))?.name).toContain('renamed');
  });

  it('keeps history when the schedule or plan changes', async () => {
    const done = await logSession('tpl_pull_a', { 0: 20 });
    const s = await repo.getSettings();
    await repo.updateSettings({ schedule: [null, 'tpl_push_a', 'tpl_pull_a', 'tpl_legs', 'tpl_pull_b', 'tpl_push_b', null] });
    await repo.deleteTemplate('tpl_pull_a');
    expect(await db.sessions.get(done!.id)).toBeTruthy();
    expect((await repo.getSettings()).schedule.includes('tpl_pull_a')).toBe(false);
    expect(s.schedule[0]).toBe('tpl_pull_a');
  });

  it('swaps an exercise only before sets are logged, and removes sessions with confirmation-free API only on request', async () => {
    const s = await repo.startSession('tpl_legs');
    const sq = s.exercises[0];
    expect(await repo.swapExercise(s.id, sq.uid, 'leg_press')).toBe(true);
    const after = (await db.sessions.get(s.id))!;
    expect(after.exercises[0]).toMatchObject({ exerciseId: 'leg_press', swappedFrom: 'squat', uid: sq.uid });
    const rows = await db.sets.where('[sessionId+exerciseUid]').equals([s.id, sq.uid]).toArray();
    expect(rows.every((r) => r.exerciseId === 'leg_press')).toBe(true);
    await repo.saveSet({ ...rows[0], weightKg: 100, reps: 8, completed: true });
    expect(await repo.swapExercise(s.id, sq.uid, 'goblet_squat')).toBe(false);
    await repo.deleteSession(s.id);
    expect(await db.sets.where('sessionId').equals(s.id).count()).toBe(0);
  });

  it('adds warm-up sets separately from working sets', async () => {
    const s = await repo.startSession('tpl_legs');
    const ex = s.exercises[0];
    await repo.addSet(s.id, ex, 'warmup', 40, 8);
    await repo.addSet(s.id, ex, 'warmup', 60, 5);
    const rows = await db.sets.where('[sessionId+exerciseUid]').equals([s.id, ex.uid]).toArray();
    expect(rows.filter((r) => r.kind === 'warmup')).toHaveLength(2);
    expect(rows.filter((r) => r.kind === 'working')).toHaveLength(3);
  });

  it('duplicates a past session into a fresh active session', async () => {
    const done = await logSession('tpl_pull_a', { 0: 20, 1: 40 });
    const copy = await repo.duplicateSession(done!.id);
    expect(copy?.status).toBe('active');
    expect(copy?.id).not.toBe(done!.id);
    const rows = await db.sets.where('sessionId').equals(copy!.id).toArray();
    expect(rows.length).toBe(await db.sets.where('sessionId').equals(done!.id).count());
    expect(rows.every((r) => !r.completed)).toBe(true);
  });

  it('stores one body-weight entry per day and keeps kg canonical', async () => {
    await repo.saveBodyWeight({ date: '2026-03-01', kg: fromDisplay(180, 'lb') });
    await repo.saveBodyWeight({ date: '2026-03-01', kg: 82 });
    const all = await db.bodyweight.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].kg).toBe(82);
  });

  it('reset wipes data then reloads the default program', async () => {
    await logSession('tpl_pull_a', { 0: 20 });
    await repo.resetAllData();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.templates.count()).toBe(5);
  });
});

describe('backup and restore', () => {
  it('round-trips everything through JSON', async () => {
    await logSession('tpl_pull_a', { 0: 20, 1: 50 });
    await repo.saveBodyWeight({ date: '2026-03-02', kg: 80 });
    await repo.updateSettings({ unit: 'lb', theme: 'light' });
    const before = await exportBackup();
    const json = JSON.parse(JSON.stringify(before));
    await repo.resetAllData();
    const res = await importBackup(json, 'replace');
    expect(res.added).toBeGreaterThan(0);
    const after = await exportBackup();
    expect(after.data.sessions).toEqual(before.data.sessions);
    expect(after.data.sets.length).toBe(before.data.sets.length);
    expect(after.data.bodyweight).toEqual(before.data.bodyweight);
    expect(after.data.settings?.unit).toBe('lb');
    expect((await db.records.toArray()).length).toBeGreaterThan(0);
  });

  it('merge imports do not create duplicates', async () => {
    await logSession('tpl_pull_a', { 0: 20 });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    const counts = { sessions: await db.sessions.count(), sets: await db.sets.count(), bw: await db.bodyweight.count() };
    const r = await importBackup(file, 'merge');
    expect(r.added).toBe(0);
    expect(await db.sessions.count()).toBe(counts.sessions);
    expect(await db.sets.count()).toBe(counts.sets);
    expect(await db.bodyweight.count()).toBe(counts.bw);
  });

  it('merge keeps the newer version of a changed record', async () => {
    const done = await logSession('tpl_pull_a', { 0: 20 });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    const s = file.data.sessions.find((x: { id: string }) => x.id === done!.id);
    s.notes = 'edited elsewhere'; s.updatedAt += 10_000;
    const r = await importBackup(file, 'merge');
    expect(r.updated).toBe(1);
    expect((await db.sessions.get(done!.id))?.notes).toBe('edited elsewhere');
  });

  describe('rejects invalid imports with useful messages', () => {
    const good = async () => JSON.parse(JSON.stringify(await exportBackup()));
    it('non-objects and foreign files', () => {
      expect(() => validateBackup(null)).toThrow(/not a Liftlog backup/);
      expect(() => validateBackup([])).toThrow(/not a Liftlog backup/);
      expect(() => validateBackup({ app: 'other', schemaVersion: 1, data: {} })).toThrow(/missing app marker/);
    });
    it('missing or newer schema versions', async () => {
      const f = await good();
      expect(() => validateBackup({ ...f, schemaVersion: 'x' })).toThrow(/schema version/);
      expect(() => validateBackup({ ...f, schemaVersion: 99 })).toThrow(/newer version/);
    });
    it('bad lists and records', async () => {
      const f = await good();
      expect(() => validateBackup({ ...f, data: { ...f.data, sets: 'nope' } })).toThrow(/must be a list/);
      await logSession('tpl_pull_a', { 0: 20 });
      const g = await good();
      const bad = JSON.parse(JSON.stringify(g));
      bad.data.sets[0].reps = -3;
      expect(() => validateBackup(bad)).toThrow(/impossible weight or rep/);
      const dup = JSON.parse(JSON.stringify(g));
      dup.data.sets.push(dup.data.sets[0]);
      expect(() => validateBackup(dup)).toThrow(/Duplicate set id/);
      const muscle = JSON.parse(JSON.stringify(g));
      muscle.data.exercises[0].primary = 'elbows';
      expect(() => validateBackup(muscle)).toThrow(/unknown primary muscle/);
      const bw = JSON.parse(JSON.stringify(g));
      bw.data.bodyweight = [{ id: 'b', date: 'yesterday', kg: 80, createdAt: 1, updatedAt: 1 }];
      expect(() => validateBackup(bw)).toThrow(/Body-weight entry/);
    });
    it('does not modify existing data when validation fails', async () => {
      await logSession('tpl_pull_a', { 0: 20 });
      const before = await db.sets.count();
      const bad = await good();
      bad.data.sets[0].completed = 'yes';
      await expect(importBackup(bad, 'replace')).rejects.toBeInstanceOf(BackupError);
      expect(await db.sets.count()).toBe(before);
    });
  });

  it('migrates a v1 backup (missing fields) forward', async () => {
    await logSession('tpl_pull_a', { 0: 20 });
    const f = JSON.parse(JSON.stringify(await exportBackup()));
    f.schemaVersion = 1;
    for (const s of f.data.sets) { delete s.kind; delete s.rir; }
    for (const s of f.data.sessions) for (const e of s.exercises) { delete e.loadModeSnapshot; delete e.secondarySnapshot; }
    const v = validateBackup(f);
    expect(v.data.sets.every((s) => s.kind === 'working' && s.rir === null)).toBe(true);
    expect(v.data.sessions[0].exercises[0].loadModeSnapshot).toBe('external');
  });
});

describe('database migrations', () => {
  it('upgrades a v1 IndexedDB database to v2 without losing rows', async () => {
    const name = `migration-${Date.now()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      exercises: 'id, name, primary, archived', templates: 'id, order', sessions: 'id, status, startedAt, templateId',
      sets: 'id, sessionId, exerciseId', bodyweight: 'id, date', records: 'id, exerciseId', settings: 'id', timer: 'id',
    });
    await old.open();
    await old.table('sets').put({ id: 'a', sessionId: 's', exerciseUid: 'u', exerciseId: 'e', index: 0, completed: true, createdAt: 1, updatedAt: 1 });
    await old.table('sessions').put({ id: 's', status: 'completed', startedAt: 1, exercises: [{ uid: 'u', exerciseId: 'e' }], templateId: null });
    old.close();

    const upgraded = new LiftlogDB(name);
    await upgraded.open();
    const set = await upgraded.sets.get('a');
    expect(set).toMatchObject({ kind: 'working', rir: null, weightKg: null, reps: null });
    const sess = await upgraded.sessions.get('s');
    expect(sess?.exercises[0]).toMatchObject({ loadModeSnapshot: 'external', secondarySnapshot: [], notes: '' });
    expect(await upgraded.sets.where('[sessionId+exerciseUid]').equals(['s', 'u']).count()).toBe(1);
    upgraded.close();
  });
});
