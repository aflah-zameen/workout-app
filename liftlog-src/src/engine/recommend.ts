import type { ExerciseDef, Muscle, Session, SetEntry, Settings, WorkoutTemplate } from '../types';
import { MUSCLES } from '../types';
import { DAY, avg, muscleLabel, startOfDay } from '../lib/util';
import { buildExerciseHistory, compareSessions } from './history';
import { adviseProgression, confidenceFor, type Confidence, type ProgressionAdvice } from './progression';
import { VOLUME_BANDS, effectiveSets, plannedWeeklySets } from './volume';

export type RecKind = 'progression' | 'improvement' | 'decline' | 'volume-low' | 'volume-high' | 'rest' | 'deload' | 'data';
export interface Recommendation {
  key: string;
  kind: RecKind;
  tone: 'positive' | 'info' | 'caution';
  title: string;
  reasons: string[];
  confidence: Confidence;
  exerciseId?: string;
  action?: { type: 'applyLoad'; exerciseId: string; weightKg: number };
}

export interface RecInput {
  now: number;
  settings: Settings;
  exercises: ExerciseDef[];
  templates: WorkoutTemplate[];
  sessions: Session[];
  sets: SetEntry[];
}

const DISMISS_MS = 7 * DAY;
const toneOrder = { caution: 0, positive: 1, info: 2 } as const;

export function buildRecommendations(inp: RecInput): Recommendation[] {
  const { now, settings, exercises, templates, sessions, sets } = inp;
  const completed = sessions.filter((s) => s.status === 'completed');
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const recs: Recommendation[] = [];

  if (completed.length === 0) {
    return [{
      key: 'data:none', kind: 'data', tone: 'info', confidence: 'insufficient',
      title: 'Recommendations start after your first workout',
      reasons: ['Liftlog only uses your own logged sets. Finish a session and suggestions will appear here with the numbers behind them.'],
    }];
  }

  // ---- Exercise-level: progression, improvement, decline --------------------------------
  const lastTemplateUse = new Map<string, { repMin: number; repMax: number; sets: number }>();
  for (const t of templates) for (const te of t.exercises) lastTemplateUse.set(te.exerciseId, { repMin: te.repMin, repMax: te.repMax, sets: te.sets });

  const exerciseIds = new Set(sets.filter((s) => s.completed).map((s) => s.exerciseId));
  let decliningCount = 0;
  const declines: string[] = [];
  for (const id of exerciseIds) {
    const ex = exMap.get(id);
    if (!ex) continue;
    const hist = buildExerciseHistory(completed, sets, id);
    if (!hist.length) continue;
    const plan = lastTemplateUse.get(id);
    const repMin = plan?.repMin ?? hist[0].ex.repMin;
    const repMax = plan?.repMax ?? hist[0].ex.repMax;
    const targetSets = plan?.sets ?? hist[0].ex.targetSets;
    const advice: ProgressionAdvice = adviseProgression({
      exercise: ex, repMin, repMax, targetSets, history: hist, settings, unit: settings.unit,
    });

    if (advice.status === 'increase' && advice.suggestedWeightKg != null) {
      recs.push({
        key: `prog:${id}:${hist[0].sessionId}`, kind: 'progression', tone: 'positive', confidence: advice.confidence,
        title: `Consider increasing ${ex.name} next session`, reasons: [advice.headline + '.', ...advice.reasons],
        exerciseId: id, action: { type: 'applyLoad', exerciseId: id, weightKg: advice.suggestedWeightKg },
      });
    } else if (advice.status === 'decline') {
      decliningCount++;
      declines.push(ex.name);
      recs.push({
        key: `decline:${id}:${hist[0].sessionId}`, kind: 'decline', tone: 'caution', confidence: advice.confidence,
        title: `${ex.name}: performance has declined in two consecutive sessions`,
        reasons: ['Review recovery before increasing volume or load.', ...advice.reasons], exerciseId: id,
      });
    } else if (hist.length >= 3) {
      const a = compareSessions(hist[2].working, hist[1].working, ex.loadMode);
      const b = compareSessions(hist[1].working, hist[0].working, ex.loadMode);
      if (a === 'up' && b === 'up') {
        recs.push({
          key: `improve:${id}:${hist[0].sessionId}`, kind: 'improvement', tone: 'positive', confidence: 'high',
          title: `Your ${ex.name} has improved over three sessions`,
          reasons: ['Each of the last three sessions beat the one before it (estimated strength, or total reps at the same load).'],
          exerciseId: id,
        });
      }
    }
  }

  // ---- Weekly volume vs plan --------------------------------------------------------------
  const first = Math.min(...completed.map((s) => s.startedAt));
  const historyDays = (now - first) / DAY;
  const planned = plannedWeeklySets(settings.schedule, templates, exMap);
  const actual = effectiveSets(completed, sets, now - 7 * DAY, now + 1);
  if (historyDays >= 14) {
    const conf = confidenceFor(Math.floor(historyDays / 7));
    for (const m of MUSCLES) {
      const p = planned[m], a = actual[m];
      if (p >= 4 && a < p * 0.6) {
        recs.push({
          key: `vol-low:${m}:${startOfDay(now)}`, kind: 'volume-low', tone: 'info', confidence: conf,
          title: `${muscleLabel(m)} is getting less work than planned`,
          reasons: [
            `Last 7 days: ${fmt(a)} effective sets. Plan: ${fmt(p)} per week.`,
            'Indirect work counts at half a set. Missed sessions are the most common cause; this is not a reason to add extra volume.',
          ],
        });
      }
      if (a > VOLUME_BANDS.excessive) {
        recs.push({
          key: `vol-high:${m}:${startOfDay(now)}`, kind: 'volume-high', tone: 'caution', confidence: conf,
          title: `${muscleLabel(m)} volume is very high this week`,
          reasons: [
            `Last 7 days: ${fmt(a)} effective sets (direct + half-weighted indirect).`,
            `Above about ${VOLUME_BANDS.excessive} weekly sets, recovery often becomes the limit. Keep it only if performance and recovery are holding up.`,
          ],
        });
      }
    }
  }

  // ---- Recovery feedback ---------------------------------------------------------------------
  const fb = completed.filter((s) => s.feedback && now - s.startedAt <= 14 * DAY).sort((a, b) => b.startedAt - a.startedAt).slice(0, 3);
  if (fb.length >= 2) {
    const rec = avg(fb.map((s) => s.feedback?.recovery).filter((v): v is number => v != null));
    const en = avg(fb.map((s) => s.feedback?.energy).filter((v): v is number => v != null));
    const sl = avg(fb.map((s) => s.feedback?.sleep).filter((v): v is number => v != null));
    const sore = avg(fb.map((s) => s.feedback?.soreness).filter((v): v is number => v != null));
    if ((rec > 0 && rec <= 2.5) || (en > 0 && en <= 2.5 && sl > 0 && sl <= 2.5) || sore >= 4) {
      recs.push({
        key: `rest:${fb[0].id}`, kind: 'rest', tone: 'caution', confidence: confidenceFor(fb.length),
        title: 'Your recovery check-ins are low; consider an extra rest day or a lighter session',
        reasons: [
          `Last ${fb.length} check-ins averaged: recovery ${rec ? rec.toFixed(1) : '–'}/5, energy ${en ? en.toFixed(1) : '–'}/5, sleep ${sl ? sl.toFixed(1) : '–'}/5, soreness ${sore ? sore.toFixed(1) : '–'}/5.`,
          'This is a training suggestion based on your own ratings, not a medical assessment. Persistent fatigue, pain or illness is worth discussing with a professional.',
        ],
      });
    }
  }
  if (decliningCount >= 2) {
    recs.push({
      key: `fatigue:${startOfDay(now)}`, kind: 'rest', tone: 'caution', confidence: 'high',
      title: 'Several exercises are trending down; reduce fatigue before adding more',
      reasons: [`Declining: ${declines.slice(0, 4).join(', ')}.`, 'Consider more sleep and food, shorter rest cuts, or a lighter week.'],
    });
  }

  // ---- Deload --------------------------------------------------------------------------------
  const since = settings.lastDeloadAt ?? first;
  const weeks = (now - since) / (7 * DAY);
  if (weeks >= settings.deloadEveryWeeks && completed.length >= 8) {
    recs.push({
      key: `deload:${Math.floor(weeks)}`, kind: 'deload', tone: 'info', confidence: 'medium',
      title: `It has been ${Math.floor(weeks)} weeks since your last deload`,
      reasons: [
        `Your setting is a deload every ${settings.deloadEveryWeeks} weeks. A common approach is about half the working sets, or loads around 10% lighter with more reps in reserve, for one week.`,
        'Skip it if you feel fresh and are still progressing; you can change the interval in Settings.',
      ],
    });
  }

  // Insufficient-data note when only a few sessions exist.
  if (completed.length < 3) {
    recs.push({
      key: 'data:few', kind: 'data', tone: 'info', confidence: 'low',
      title: 'Limited history: confidence is low',
      reasons: [`${completed.length} session${completed.length === 1 ? '' : 's'} logged. Trends need three sessions per exercise; weekly volume checks need two weeks of data.`],
    });
  }

  const dismissed = settings.dismissed;
  return recs
    .filter((r) => !(dismissed[r.key] && now - dismissed[r.key] < DISMISS_MS))
    .sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export type { Muscle };
