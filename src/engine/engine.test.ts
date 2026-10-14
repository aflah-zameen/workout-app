import { describe, expect, it } from 'vitest';
import { DAY } from '../lib/util';
import { fromDisplay } from '../lib/units';
import { buildExercises, buildSettings, buildTemplates, DEFAULT_SCHEDULE } from '../data/seed';
import { fakeSession, merge } from '../test/helpers';
import { adviseProgression } from './progression';
import { buildExerciseHistory, estimate1RM, compareSessions } from './history';
import { computeRecords, sessionPRs } from './records';
import { effectiveSets, plannedWeeklySets, estimateDurationSec } from './volume';
import { buildRecommendations } from './recommend';
import { nextWorkout } from './nextWorkout';
import { warmupRamp } from './warmup';

const T0 = new Date('2026-03-02T09:00:00').getTime(); // a Monday
const exercises = buildExercises(T0);
const exMap = new Map(exercises.map((e) => [e.id, e]));
const settings = buildSettings(T0);
const press = exMap.get('incline_db_press')!;

const adviseFor = (parts: ReturnType<typeof fakeSession>[], over: Partial<typeof settings> = {}) => {
  const { sessions, sets } = merge(...parts);
  return adviseProgression({
    exercise: press, repMin: 6, repMax: 10, targetSets: 3,
    history: buildExerciseHistory(sessions, sets, press.id), settings: { ...settings, ...over }, unit: 'kg',
  });
};
const press_s = (day: number, rows: [number, number, number?][]) =>
  fakeSession({ startedAt: T0 + day * DAY, exerciseId: press.id, sets: rows, repMin: 6, repMax: 10 });

describe('seed program', () => {
  it('loads the five-day plan exactly as specified', () => {
    const t = buildTemplates(T0);
    expect(t.map((x) => x.name)).toEqual(['Pull A', 'Push A', 'Legs and abs', 'Pull B', 'Push B']);
    expect(t.map((x) => x.exercises.length)).toEqual([6, 6, 7, 6, 7]);
    const pullA = t[0].exercises.map((e) => `${e.sets}x${e.repMin}-${e.repMax}`);
    expect(pullA).toEqual(['3x6-10', '3x8-12', '3x8-12', '3x12-20', '3x8-12', '2x10-15']);
    expect(t[2].exercises.map((e) => e.sets)).toEqual([3, 3, 3, 2, 3, 3, 2]);
    expect(t[4].exercises.map((e) => `${e.sets}x${e.repMin}-${e.repMax}`)).toEqual(['3x8-12', '2x8-15', '3x12-20', '2x12-20', '2x10-15', '3x10-15', '3x10-15']);
  });
  it('every plan exercise exists in the library and has valid alternatives', () => {
    for (const t of buildTemplates(T0)) for (const e of t.exercises) expect(exMap.has(e.exerciseId)).toBe(true);
    for (const e of exercises) for (const a of e.alternatives) expect(exMap.has(a)).toBe(true);
  });
  it('schedules five training days and two rest days', () => {
    expect(DEFAULT_SCHEDULE.filter(Boolean)).toHaveLength(5);
    expect(DEFAULT_SCHEDULE.filter((x) => !x)).toHaveLength(2);
  });
  it('estimates a realistic session length', () => {
    const t = buildTemplates(T0)[0];
    const min = estimateDurationSec(t, exMap, { compound: 150, isolation: 90 }) / 60;
    expect(min).toBeGreaterThan(40);
    expect(min).toBeLessThan(110);
  });
});

describe('progression engine', () => {
  it('reports insufficient data without history', () => {
    const a = adviseFor([]);
    expect(a.status).toBe('insufficient');
    expect(a.confidence).toBe('insufficient');
  });

  it('suggests a load increase when every set hits the top of the range', () => {
    const a = adviseFor([press_s(0, [[30, 10, 2], [30, 10, 2], [30, 10, 1]])]);
    expect(a.status).toBe('increase');
    expect(a.suggestedWeightKg).toBe(32); // +2 kg dumbbell step
    expect(a.confidence).toBe('low'); // one session only
    expect(a.reasons.join(' ')).toMatch(/top of the 6–10 range/);
    expect(a.reasons.join(' ')).toMatch(/one session only/);
  });

  it('does not suggest an increase if any set missed the top', () => {
    const a = adviseFor([press_s(0, [[30, 10, 2], [30, 9, 2], [30, 8, 1]])]);
    expect(a.status).toBe('add_reps');
    expect(a.targetReps).toBe(9);
    expect(a.suggestedWeightKg).toBeUndefined();
  });

  it('holds when top-of-range sets were near failure (low RIR)', () => {
    const a = adviseFor([press_s(0, [[30, 10, 0], [30, 10, 0], [30, 10, 0]])]);
    expect(a.status).toBe('hold');
    expect(a.reasons.join(' ')).toMatch(/near failure/);
  });

  it('requires two sessions at the top when the setting says so', () => {
    const one = adviseFor([press_s(0, [[30, 10, 2], [30, 10, 2], [30, 10, 2]])], { sessionsAtTop: 2 });
    expect(one.status).not.toBe('increase');
    const two = adviseFor([
      press_s(0, [[30, 10, 2], [30, 10, 2], [30, 10, 2]]), press_s(3, [[30, 10, 2], [30, 10, 2], [30, 10, 2]]),
    ], { sessionsAtTop: 2 });
    expect(two.status).toBe('increase');
  });

  it('never recommends an increase after two consecutive declines; flags recovery instead', () => {
    const a = adviseFor([
      press_s(0, [[32, 10, 2], [32, 10, 2], [32, 10, 2]]),
      press_s(3, [[32, 9, 1], [32, 8, 1], [32, 7, 0]]),
      press_s(6, [[32, 7, 0], [32, 6, 0], [32, 5, 0]]),
    ]);
    expect(a.status).toBe('decline');
    expect(a.suggestedWeightKg).toBeUndefined();
    expect(a.reasons.join(' ')).toMatch(/sleep|recovery|fatigue/i);
  });

  it('a single weaker session only holds the weight (no alarm)', () => {
    const a = adviseFor([
      press_s(0, [[32, 9, 2], [32, 9, 2], [32, 8, 2]]),
      press_s(3, [[32, 7, 1], [32, 6, 0], [32, 6, 0]]),
    ]);
    expect(a.status).toBe('hold');
  });

  it('respects per-exercise custom rules and the global off switch', () => {
    const parts = [press_s(0, [[30, 10, 2], [30, 10, 2], [30, 10, 2]])];
    expect(adviseFor(parts, { rules: { [press.id]: { mode: 'off' } } }).status).toBe('off');
    expect(adviseFor(parts, { progressionEnabled: false }).status).toBe('off');
    const custom = adviseFor(parts, { rules: { [press.id]: { mode: 'suggest', incrementKg: 1 } } });
    expect(custom.suggestedWeightKg).toBe(31);
  });

  it('reduces assistance for assisted exercises and adds load for bodyweight ones', () => {
    const assisted = exMap.get('assisted_pullup')!;
    const mk = (w: number) => fakeSession({ startedAt: T0, exerciseId: assisted.id, mode: 'assisted', sets: [[w, 10], [w, 10], [w, 10]] });
    const { sessions, sets } = merge(mk(30));
    const a = adviseProgression({ exercise: assisted, repMin: 6, repMax: 10, targetSets: 3, history: buildExerciseHistory(sessions, sets, assisted.id), settings, unit: 'kg' });
    expect(a.status).toBe('increase');
    expect(a.suggestedWeightKg).toBe(27.5);

    const pull = exMap.get('pullup')!;
    const bw = merge(fakeSession({ startedAt: T0, exerciseId: pull.id, mode: 'bodyweight', sets: [[0, 10], [0, 10], [0, 10]] }));
    const b = adviseProgression({ exercise: pull, repMin: 6, repMax: 10, targetSets: 3, history: buildExerciseHistory(bw.sessions, bw.sets, pull.id), settings, unit: 'kg' });
    expect(b.status).toBe('increase');
    expect(b.suggestedWeightKg).toBe(2.5);
  });

  it('suggests practical lb jumps for lb users', () => {
    const squat = exMap.get('squat')!;
    const kg = fromDisplay(225, 'lb');
    const { sessions, sets } = merge(fakeSession({ startedAt: T0, exerciseId: squat.id, sets: [[kg, 10], [kg, 10], [kg, 10]] }));
    const a = adviseProgression({ exercise: squat, repMin: 6, repMax: 10, targetSets: 3, history: buildExerciseHistory(sessions, sets, squat.id), settings, unit: 'lb' });
    expect(a.headline).toMatch(/230 lb/);
  });

  it('ignores warm-up sets and unfinished sets', () => {
    const base = press_s(0, [[30, 10, 2], [30, 10, 2], [30, 10, 2]]);
    const warm = fakeSession({ startedAt: T0, exerciseId: press.id, sets: [[10, 12]], kind: 'warmup', id: base.session.id });
    warm.session.exercises = base.session.exercises;
    warm.sets.forEach((s) => { s.exerciseUid = base.sets[0].exerciseUid; s.id = 'w1'; });
    const incomplete = { ...base.sets[0], id: 'x', completed: false, reps: 1 };
    const sessions = [base.session]; const sets = [...base.sets, ...warm.sets, incomplete];
    const h = buildExerciseHistory(sessions, sets, press.id);
    expect(h[0].working).toHaveLength(3);
    expect(h[0].warmups).toHaveLength(1);
  });
});

describe('records and estimates', () => {
  it('estimates 1RM only for 1–10 rep sets with load', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 15)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
    expect(estimate1RM(null, 5)).toBeNull();
  });

  it('computes records from completed working sets only and flags real PRs', () => {
    const a = press_s(0, [[30, 8], [30, 8], [30, 8]]);
    const b = press_s(7, [[32, 8], [32, 7], [30, 8]]);
    const warm = fakeSession({ startedAt: T0 + 14 * DAY, exerciseId: press.id, sets: [[100, 5]], kind: 'warmup' });
    const { sessions, sets } = merge(a, b, warm);
    const recs = computeRecords(sessions, sets);
    expect(recs.find((r) => r.id === `${press.id}:weight`)?.value).toBe(32);
    const prs = sessionPRs(b.session.id, sessions, sets);
    expect(prs.some((p) => p.type === 'weight' && p.previous === 30)).toBe(true);
    // the first-ever session is a baseline, not a PR
    expect(sessionPRs(a.session.id, sessions, sets)).toHaveLength(0);
  });

  it('compares sessions by estimated strength, then volume', () => {
    const mk = (rows: [number, number][]) => fakeSession({ startedAt: T0, exerciseId: 'x', sets: rows }).sets;
    expect(compareSessions(mk([[30, 8]]), mk([[32, 8]]), 'external')).toBe('up');
    expect(compareSessions(mk([[30, 8]]), mk([[30, 6]]), 'external')).toBe('down');
    expect(compareSessions(mk([[30, 8]]), mk([[30, 8]]), 'external')).toBe('same');
  });
});

describe('volume and schedule', () => {
  it('counts indirect work at half a set', () => {
    const p = merge(
      fakeSession({ startedAt: T0, exerciseId: 'bench', muscle: 'chest', secondary: ['triceps', 'front_delts'], sets: [[60, 8], [60, 8], [60, 8]] }),
    );
    const v = effectiveSets(p.sessions, p.sets, T0 - DAY, T0 + DAY);
    expect(v.chest).toBe(3);
    expect(v.triceps).toBe(1.5);
    expect(v.front_delts).toBe(1.5);
    expect(v.lats).toBe(0);
  });

  it('plans weekly muscle volume from the schedule, with overlap', () => {
    const planned = plannedWeeklySets(DEFAULT_SCHEDULE, buildTemplates(T0), exMap);
    expect(planned.chest).toBeGreaterThan(10);
    expect(planned.biceps).toBeGreaterThan(8); // direct curls + indirect from pulls
    expect(planned.calves).toBe(3);
  });

  it('recommends today’s scheduled workout, the unfinished one, or a missed one', () => {
    const tpls = buildTemplates(T0);
    const monday = T0;
    expect(nextWorkout({ schedule: DEFAULT_SCHEDULE }, tpls, [], monday)).toMatchObject({ kind: 'today' });
    const wed = T0 + 2 * DAY;
    expect(nextWorkout({ schedule: DEFAULT_SCHEDULE }, tpls, [], wed)).toMatchObject({ kind: 'missed' });
    const done = fakeSession({ startedAt: T0 + 1000, exerciseId: 'x', sets: [[1, 1]], templateId: 'tpl_pull_a' });
    expect(nextWorkout({ schedule: DEFAULT_SCHEDULE }, tpls, [done.session], monday + 5000)).toMatchObject({ kind: 'done' });
    const active = fakeSession({ startedAt: T0, exerciseId: 'x', sets: [[1, 1]], status: 'active' });
    expect(nextWorkout({ schedule: DEFAULT_SCHEDULE }, tpls, [active.session], wed)).toMatchObject({ kind: 'resume' });
    const rest = nextWorkout({ schedule: [null, null, null, null, null, null, null] }, tpls, [], wed);
    expect(rest).toMatchObject({ kind: 'rest' });
  });

  it('builds warm-up ramps that stay below the working weight', () => {
    const r = warmupRamp(100, 'kg', 2.5);
    expect(r.map((x) => x.weightKg)).toEqual([50, 70, 85]);
    expect(warmupRamp(0, 'kg', 2.5)).toEqual([]);
  });
});

describe('recommendations', () => {
  const base = { now: T0 + 60 * DAY, settings, exercises, templates: buildTemplates(T0) };

  it('shows an honest empty state with no history', () => {
    const recs = buildRecommendations({ ...base, sessions: [], sets: [] });
    expect(recs).toHaveLength(1);
    expect(recs[0].confidence).toBe('insufficient');
  });

  it('produces an explained, editable progression card from real history', () => {
    const { sessions, sets } = merge(press_s(50, [[30, 10, 2], [30, 10, 2], [30, 10, 2]]));
    const recs = buildRecommendations({ ...base, sessions, sets });
    const r = recs.find((x) => x.kind === 'progression');
    expect(r?.title).toMatch(/incline dumbbell press/i);
    expect(r?.reasons.length).toBeGreaterThan(1);
    expect(r?.action).toEqual({ type: 'applyLoad', exerciseId: press.id, weightKg: 32 });
    expect(recs.some((x) => x.key === 'data:few')).toBe(true);
  });

  it('flags repeated decline and holds back load increases', () => {
    const { sessions, sets } = merge(
      press_s(40, [[32, 10, 2], [32, 10, 2], [32, 10, 2]]),
      press_s(44, [[32, 9, 1], [32, 8, 1], [32, 7, 0]]),
      press_s(48, [[32, 7, 0], [32, 6, 0], [32, 5, 0]]),
    );
    const recs = buildRecommendations({ ...base, sessions, sets });
    expect(recs.find((r) => r.kind === 'decline')?.tone).toBe('caution');
    expect(recs.some((r) => r.kind === 'progression')).toBe(false);
  });

  it('notes sustained improvement over three sessions', () => {
    const { sessions, sets } = merge(
      press_s(40, [[28, 8], [28, 8], [28, 8]]), press_s(44, [[30, 8], [30, 8], [30, 8]]), press_s(48, [[32, 8], [32, 8], [32, 8]]),
    );
    const recs = buildRecommendations({ ...base, sessions, sets });
    expect(recs.some((r) => r.kind === 'improvement')).toBe(true);
  });

  it('flags planned muscles that were under-trained over the last week once enough history exists', () => {
    // 3 weeks of history but only one chest set last week
    const { sessions, sets } = merge(
      press_s(0, [[30, 8], [30, 8], [30, 8]]),
      fakeSession({ startedAt: T0 + 59 * DAY, exerciseId: 'bench_press', muscle: 'chest', sets: [[60, 8]] }),
    );
    const recs = buildRecommendations({ ...base, now: T0 + 60 * DAY, sessions, sets });
    expect(recs.some((r) => r.kind === 'volume-low' && /chest/i.test(r.title))).toBe(true);
  });

  it('suggests rest from low recovery check-ins and does not diagnose', () => {
    const fb = (d: number) => ({ sleep: 2, energy: 2, soreness: 4, recovery: 2, at: T0 + d * DAY });
    const parts = [55, 57, 59].map((d) => fakeSession({ startedAt: T0 + d * DAY, exerciseId: press.id, sets: [[30, 8]], feedback: fb(d) }));
    const { sessions, sets } = merge(...parts);
    const r = buildRecommendations({ ...base, sessions, sets }).find((x) => x.kind === 'rest');
    expect(r?.title).toMatch(/rest day|lighter/i);
    expect(r?.reasons.join(' ')).toMatch(/not a medical/i);
  });

  it('respects dismissed recommendations for a week', () => {
    const { sessions, sets } = merge(press_s(50, [[30, 10, 2], [30, 10, 2], [30, 10, 2]]));
    const first = buildRecommendations({ ...base, sessions, sets }).find((x) => x.kind === 'progression')!;
    const dismissed = buildRecommendations({ ...base, settings: { ...settings, dismissed: { [first.key]: base.now } }, sessions, sets });
    expect(dismissed.some((x) => x.key === first.key)).toBe(false);
  });
});
