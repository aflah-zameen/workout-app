import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { createTemplate, startSession } from '../db/repo';
import { estimateDurationSec } from '../engine/volume';
import { fmtMinutes, WEEKDAYS } from '../lib/util';
import { Icon } from '../components/ui';
import { CheckInSheet } from '../components/CheckIn';
import { ScheduleEditor } from '../components/ScheduleEditor';
import ActiveWorkout from './ActiveWorkout';
import PlanEditor from './PlanEditor';
import Summary from './Summary';
import { ALTERNATIVE_NOTE, WARMUP_GUIDE } from '../data/seed';
import type { WorkoutTemplate } from '../types';

export default function Workout() {
  const { active, templates, settings, exMap, intent, clearIntent, go } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [starting, setStarting] = useState<WorkoutTemplate | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => { if (intent.openTemplate) { setEditing(intent.openTemplate); clearIntent(); } }, [intent, clearIntent]);

  if (active) return <><ActiveWorkout onFinished={setSummary} />{summary && <Summary sessionId={summary} onClose={() => { setSummary(null); go('home'); }} />}</>;
  if (summary) return <Summary sessionId={summary} onClose={() => { setSummary(null); go('home'); }} />;

  const begin = async (t: WorkoutTemplate, o: { feedback?: import('../types').Feedback; deload?: boolean }) => { setStarting(null); await startSession(t.id, o); };

  if (editing) return <><PlanEditor templateId={editing} onBack={() => setEditing(null)} onStart={(t) => setStarting(t)} />{starting && <CheckInSheet title={starting.name} onClose={() => setStarting(null)} onStart={(o) => begin(starting, o)} />}</>;

  return (
    <div className="stack">
      <div><h1 className="page-title">Workouts</h1><p className="page-sub">Your five-day plan. Tap a workout to edit it.</p></div>

      {templates.map((t) => {
        const days = settings.schedule.map((id, i) => (id === t.id ? WEEKDAYS[i] : null)).filter(Boolean).join(', ');
        return (
          <div className="card stack" key={t.id}>
            <button className="item" style={{ padding: 0 }} onClick={() => setEditing(t.id)}>
              <div className="main">
                <div className="ex-name">{t.name}</div>
                <div className="small muted">{t.focus}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{t.exercises.length} exercises · {t.exercises.reduce((s, e) => s + e.sets, 0)} sets · ~{fmtMinutes(estimateDurationSec(t, exMap, { compound: settings.restCompoundSec, isolation: settings.restIsolationSec }))} · {days || 'Not scheduled'}</div>
              </div>
              <Icon name="chevron" size={18} />
            </button>
            <button className="btn primary block" onClick={() => setStarting(t)}><Icon name="play" size={16} /> Start {t.name}</button>
          </div>
        );
      })}

      <div className="row">
        <button className="btn grow" onClick={async () => { const t = await createTemplate('New workout'); setEditing(t.id); }}><Icon name="plus" size={18} /> New workout</button>
        <button className="btn grow" onClick={async () => { await startSession(null, { name: 'Custom workout' }); }}>Empty session</button>
      </div>

      <div className="card stack">
        <button className="row between" onClick={() => setShowSchedule(!showSchedule)} aria-expanded={showSchedule}><h2 className="section-title">Weekly schedule</h2><span className="muted small">{showSchedule ? 'Hide' : 'Edit'}</span></button>
        {showSchedule && <ScheduleEditor />}
      </div>

      <div className="card stack">
        <button className="row between" onClick={() => setGuide(!guide)} aria-expanded={guide}><h2 className="section-title">Warm-up and effort guide</h2><span className="muted small">{guide ? 'Hide' : 'Read'}</span></button>
        {guide && (
          <div className="stack small" style={{ gap: 10 }}>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>{WARMUP_GUIDE.map((g) => <li key={g}>{g}</li>)}</ul>
            <p><b>Effort:</b> most working sets should finish with about 1–3 reps in reserve (RIR). Pushing a safe isolation exercise to failure on the last set now and then is fine; avoid taking every set there.</p>
            <p><b>Rest:</b> 2–3 minutes for demanding compound lifts, roughly 60–120 seconds for isolation work. Adjust per exercise.</p>
            <p><b>Recovery:</b> keep two rest days, and plan a lighter deload week about every {settings.deloadEveryWeeks} weeks or sooner if performance keeps slipping.</p>
            <p className="muted">{ALTERNATIVE_NOTE}</p>
          </div>
        )}
      </div>
      {starting && <CheckInSheet title={starting.name} onClose={() => setStarting(null)} onStart={(o) => begin(starting, o)} />}
    </div>
  );
}
