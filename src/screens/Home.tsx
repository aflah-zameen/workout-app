import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { nextWorkout } from '../engine/nextWorkout';
import { buildRecommendations } from '../engine/recommend';
import { recordEvents } from '../engine/records';
import { estimateDurationSec } from '../engine/volume';
import { startSession } from '../db/repo';
import { fmtDate, fmtDuration, fmtMinutes, relativeDay, startOfWeek, DAY, WEEKDAYS, weekdayIndex, startOfDay } from '../lib/util';
import { fmtWeight } from '../lib/units';
import { Icon, Empty } from '../components/ui';
import { ColumnChart } from '../components/Charts';
import { InsightCard } from '../components/Insight';
import { CheckInSheet } from '../components/CheckIn';
import type { WorkoutTemplate } from '../types';

export default function Home() {
  const app = useApp();
  const { settings, templates, completed, sessions, sets, exercises, exMap, go, active } = app;
  const [checkin, setCheckin] = useState<WorkoutTemplate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const at = Date.now();

  const next = useMemo(() => nextWorkout(settings, templates, sessions, at), [settings, templates, sessions, Math.floor(at / 60000)]);
  const recs = useMemo(() => buildRecommendations({ now: at, settings, exercises, templates, sessions, sets }), [settings, exercises, templates, sessions, sets, Math.floor(at / 60000)]);
  const prs = useMemo(
    () => recordEvents(completed, sets).filter((e) => e.previous != null && e.type !== 'setVolume' && at - e.at < 30 * DAY).sort((a, b) => b.at - a.at).slice(0, 5),
    [completed, sets],
  );
  const last = completed[0];
  const tMap = new Map(templates.map((t) => [t.id, t]));

  const weekStart = startOfWeek(at);
  const weekDone = completed.filter((s) => s.startedAt >= weekStart);
  const planned = settings.schedule.filter(Boolean).length;
  const weekly = useMemo(() => {
    const vals: number[] = [], labels: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = weekStart - i * 7 * DAY;
      vals.push(completed.filter((s) => s.startedAt >= ws && s.startedAt < ws + 7 * DAY).length);
      labels.push(fmtDate(ws, { month: 'numeric', day: 'numeric' }));
    }
    return { vals, labels };
  }, [completed, weekStart]);

  const start = async (t: WorkoutTemplate, opts: { feedback?: import('../types').Feedback; deload?: boolean }) => {
    setCheckin(null);
    await startSession(t.id, opts);
    go('workout');
  };

  const todayIdx = weekdayIndex(at);
  const dayDone = (i: number) => {
    const ds = weekStart + i * DAY;
    return completed.some((s) => s.startedAt >= ds && s.startedAt < ds + DAY);
  };

  let hero: React.ReactNode;
  const heroFor = (t: WorkoutTemplate, label: string, cta: string) => (
    <>
      <div className="row between">
        <span className="pill accent">{label}</span>
        <span className="small muted">{t.exercises.length} exercises · ~{fmtMinutes(estimateDurationSec(t, exMap, { compound: settings.restCompoundSec, isolation: settings.restIsolationSec }))}</span>
      </div>
      <div><div className="big-num" style={{ fontSize: 34 }}>{t.name}</div><p className="muted" style={{ marginTop: 6 }}>{t.focus}</p></div>
      <button className="btn primary block" style={{ minHeight: 54, fontSize: 17 }} onClick={() => setCheckin(t)}><Icon name="play" size={18} /> {cta}</button>
    </>
  );
  if (next.kind === 'resume') {
    const s = next.session;
    hero = (
      <>
        <span className="pill accent">In progress</span>
        <div><div className="big-num" style={{ fontSize: 34 }}>{s.name}</div><p className="muted" style={{ marginTop: 6 }}>Started {relativeDay(s.startedAt)} at {new Date(s.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Nothing is lost; pick up where you left off.</p></div>
        <button className="btn primary block" style={{ minHeight: 54, fontSize: 17 }} onClick={() => go('workout')}>Resume workout</button>
      </>
    );
  } else if (next.kind === 'today') hero = heroFor(next.template, 'Today', 'Start workout');
  else if (next.kind === 'missed') {
    hero = (
      <>
        {heroFor(next.template, `Missed ${next.scheduledDaysAgo === 1 ? 'yesterday' : next.scheduledDaysAgo + ' days ago'}`, 'Do it today')}
        <p className="small muted">Today is a rest day on your schedule. Rest is fine too; the choice is yours.</p>
      </>
    );
  } else if (next.kind === 'done') {
    hero = (
      <>
        <span className="pill accent">Done for today</span>
        <div className="big-num" style={{ fontSize: 30 }}>{next.template.name} complete</div>
        {next.next && <p className="muted">Next: {next.next.template.name} on {WEEKDAYS[(todayIdx + next.next.daysAhead) % 7]}.</p>}
        <button className="btn block" onClick={() => go('workout')}>Browse workouts</button>
      </>
    );
  } else {
    hero = (
      <>
        <span className="pill">Rest day</span>
        <div className="big-num" style={{ fontSize: 30 }}>Recover and come back stronger</div>
        {next.next && <p className="muted">Next up: {next.next.template.name} on {WEEKDAYS[(todayIdx + next.next.daysAhead) % 7]}.</p>}
        <button className="btn block" onClick={() => go('workout')}>Start a workout anyway</button>
      </>
    );
  }

  const visible = showAll ? recs : recs.slice(0, 3);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Liftlog</h1>
        <p className="page-sub">{new Date(at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="card accent stack">{hero}</div>

      <div className="card stack">
        <div className="row between"><h2 className="section-title">This week</h2><button className="small muted" style={{ minHeight: 36 }} onClick={() => go('settings')}>Edit schedule</button></div>
        <div className="week">
          {WEEKDAYS.map((d, i) => {
            const t = settings.schedule[i] ? tMap.get(settings.schedule[i]!) : null;
            return (
              <div key={d} className={'day' + (i === todayIdx ? ' today' : '')} aria-label={`${d}: ${t?.name ?? 'rest'}${dayDone(i) ? ', completed' : ''}`}>
                <span className="d">{d}</span>
                <span className="t">{t ? t.name.replace('Legs and abs', 'Legs').replace(' ', '\u00A0') : '–'}</span>
                <span className={'mk' + (dayDone(i) ? ' done' : '')} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="row between"><h2 className="section-title">Insights</h2>{recs.length > 3 && <button className="small muted" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${recs.length}`}</button>}</div>
      {visible.length ? visible.map((r) => <InsightCard key={r.key} rec={r} />) : <div className="card"><Empty title="Nothing to flag">Your recent training looks on track. New suggestions appear after each workout.</Empty></div>}

      <div className="grid2">
        <div className="card stat"><span className="v num">{weekDone.length}<span className="muted" style={{ fontSize: 15 }}> / {planned}</span></span><span className="l">sessions this week</span></div>
        <div className="card stat"><span className="v num">{completed.length}</span><span className="l">workouts logged</span></div>
      </div>

      <div className="card stack">
        <h2 className="section-title">Consistency</h2>
        {completed.length ? <ColumnChart values={weekly.vals} labels={weekly.labels} ariaLabel="Workouts per week, last 8 weeks" /> : <Empty title="No workouts yet">Your weekly consistency appears after your first session.</Empty>}
      </div>

      <div className="card stack">
        <h2 className="section-title">Last workout</h2>
        {last ? (
          <button className="item" style={{ padding: 0 }} onClick={() => go('history', { openSession: last.id })}>
            <div className="main">
              <div className="title">{last.name}</div>
              <div className="small muted">{relativeDay(last.startedAt)} · {fmtDuration(last.durationSec ?? 0)} · {sets.filter((s) => s.sessionId === last.id && s.completed && s.kind === 'working').length} working sets</div>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        ) : <Empty title="Nothing logged yet">Start today’s workout to build your history.</Empty>}
      </div>

      <div className="card stack">
        <h2 className="section-title">Recent records</h2>
        {prs.length ? (
          <div className="list">
            {prs.map((p, i) => (
              <div className="item" key={i}>
                <span style={{ color: 'var(--accent)' }}><Icon name="trophy" size={20} /></span>
                <div className="main">
                  <div className="title ellip">{exMap.get(p.exerciseId)?.name ?? 'Exercise'}</div>
                  <div className="small muted">{prLabel(p, settings.unit)} · {relativeDay(p.at)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title="No records yet">Records appear when you beat a previous best. First sessions set your baseline.</Empty>}
      </div>

      {checkin && <CheckInSheet title={checkin.name} onClose={() => setCheckin(null)} onStart={(o) => start(checkin, o)} />}
      <span className="sr-only">{active ? 'Workout active' : ''}{startOfDay(at)}</span>
    </div>
  );
}

import type { RecordEvent } from '../engine/records';
import type { Unit } from '../types';
export function prLabel(p: RecordEvent, unit: Unit): string {
  if (p.type === 'weight') return `Heaviest: ${fmtWeight(p.weightKg, unit, true)} × ${p.reps}`;
  if (p.type === 'e1rm') return `Estimated 1RM: ${fmtWeight(p.value, unit, true)}`;
  if (p.type === 'reps') return `Most reps: ${p.reps}`;
  return `Best set: ${fmtWeight(p.weightKg, unit, true)} × ${p.reps}`;
}
