import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../ctx';
import * as repo from '../db/repo';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { fmtDate, fmtDuration, relativeDay } from '../lib/util';
import { fmtWeight, fromDisplay, incrementFor, toDisplay } from '../lib/units';
import { Empty, Icon, NumInput } from '../components/ui';
import { describeSets } from '../engine/progression';
import type { Session, SetEntry } from '../types';
import { weightHeader } from './ActiveWorkout';

export default function History() {
  const { completed, sets, intent, clearIntent } = useApp();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (intent.openSession) { setOpenId(intent.openSession); clearIntent(); } }, [intent, clearIntent]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sets) if (s.completed && s.kind === 'working') m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1);
    return m;
  }, [sets]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return completed;
    return completed.filter((s) => [s.name, s.focus, s.notes, fmtDate(s.startedAt, { month: 'long', day: 'numeric', year: 'numeric' }), ...s.exercises.flatMap((e) => [e.nameSnapshot, e.notes])].join(' ').toLowerCase().includes(ql));
  }, [completed, q]);

  if (openId && completed.find((s) => s.id === openId)) return <Detail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="stack">
      <div><h1 className="page-title">History</h1><p className="page-sub">{completed.length} workout{completed.length === 1 ? '' : 's'} logged</p></div>
      <div className="row"><span style={{ position: 'relative', flex: 1 }}><input type="search" placeholder="Search workouts, exercises, notes" aria-label="Search history" value={q} onChange={(e) => setQ(e.target.value)} /></span></div>
      {completed.length === 0 ? <div className="card"><Empty title="No workouts yet">Finished workouts are saved here with every set.</Empty></div>
        : filtered.length === 0 ? <div className="card"><Empty title="No matches">Try an exercise name, a muscle focus or a word from your notes.</Empty></div>
        : <div className="card"><div className="list">{filtered.map((s) => (
          <button key={s.id} className="item" onClick={() => setOpenId(s.id)}>
            <div className="main"><div className="title ellip">{s.name}</div><div className="small muted">{fmtDate(s.startedAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {fmtDuration(s.durationSec ?? 0)} · {counts.get(s.id) ?? 0} sets</div></div>
            <Icon name="chevron" size={18} />
          </button>))}</div></div>}
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { completed, settings, confirm, toast, go, active } = useApp();
  const s = completed.find((x) => x.id === id)!;
  const rows = useLiveQuery(() => db.sets.where('sessionId').equals(id).toArray(), [id]) ?? [];
  const [edit, setEdit] = useState(false);
  const unit = settings.unit;

  const done = async () => { setEdit(false); await repo.rebuildRecords(); toast('Changes saved'); };
  const patchSession = (p: Partial<Session>) => repo.updateSession(id, p);
  const patchSet = (r: SetEntry, p: Partial<SetEntry>) => repo.saveSet({ ...r, ...p });

  return (
    <div className="stack">
      <button className="back" onClick={onBack}><Icon name="back" size={18} /> History</button>
      <div className="card stack">
        {edit ? (
          <>
            <div className="field"><label htmlFor="hn">Name</label><input id="hn" type="text" value={s.name} onChange={(e) => patchSession({ name: e.target.value })} /></div>
            <div className="field"><label htmlFor="hd">Date</label><input id="hd" type="date" value={new Date(s.startedAt - new Date(s.startedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
              onChange={(e) => { if (!e.target.value) return; const d = new Date(e.target.value + 'T' + new Date(s.startedAt).toTimeString().slice(0, 8)); if (!Number.isNaN(d.getTime())) patchSession({ startedAt: d.getTime(), finishedAt: d.getTime() + (s.durationSec ?? 0) * 1000 }); }} /></div>
            <div className="field"><label htmlFor="hm">Duration (minutes)</label><input id="hm" type="number" inputMode="numeric" min={1} max={600} value={Math.round((s.durationSec ?? 0) / 60)} onChange={(e) => patchSession({ durationSec: Math.max(1, Number(e.target.value) || 1) * 60 })} /></div>
          </>
        ) : (
          <>
            <div className="ex-name" style={{ fontSize: 22 }}>{s.name}</div>
            <div className="small muted">{fmtDate(s.startedAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {relativeDay(s.startedAt)}</div>
            <div className="small muted num">{fmtDuration(s.durationSec ?? 0)} · {rows.filter((r) => r.completed && r.kind === 'working').length} working sets{s.deload ? ' · deload' : ''}</div>
          </>
        )}
        {s.feedback && <div className="chips">{(['sleep', 'energy', 'soreness', 'recovery'] as const).map((k) => s.feedback![k] ? <span className="pill" key={k}>{k} {s.feedback![k]}/5</span> : null)}</div>}
      </div>

      {s.exercises.map((ex) => {
        const mine = rows.filter((r) => r.exerciseUid === ex.uid && r.completed).sort((a, b) => a.index - b.index);
        const working = mine.filter((r) => r.kind === 'working');
        const step = incrementFor(2.5, unit);
        return (
          <div className="card stack" key={ex.uid}>
            <div className="ex-name">{ex.nameSnapshot}</div>
            {!edit ? (
              <>
                <div className="num small">{mine.map((r) => (r.kind === 'warmup' ? 'W ' : '') + describeSets([r], unit, ex.loadModeSnapshot) + (r.rir != null ? ` @${r.rir}` : '')).join('  ·  ')}</div>
                {ex.notes && <p className="small muted">“{ex.notes}”</p>}
              </>
            ) : (
              <>
                <div className="set-head"><span>Set</span><span>{weightHeader(ex, unit)}</span><span>Reps</span><span>RIR</span><span /></div>
                {mine.map((r) => (
                  <div className="set-row" key={r.id}>
                    <span className={'set-no' + (r.kind === 'warmup' ? ' w' : '')}>{r.kind === 'warmup' ? 'W' : working.indexOf(r) + 1}</span>
                    <NumInput label="Weight" step={step} value={r.weightKg == null ? null : toDisplay(r.weightKg, unit)} onChange={(v) => patchSet(r, { weightKg: v == null ? null : fromDisplay(v, unit) })} />
                    <NumInput label="Reps" step={1} decimals={false} value={r.reps} onChange={(v) => patchSet(r, { reps: v == null ? null : Math.round(v) })} />
                    <button className="rir-btn" aria-label="Reps in reserve" onClick={() => patchSet(r, { rir: r.rir == null ? 3 : r.rir === 0 ? null : r.rir - 1 })}>{r.rir ?? '–'}</button>
                    <button className="icon-btn" aria-label="Delete set" onClick={async () => { if (await confirm({ title: 'Delete this set?', confirmLabel: 'Delete', danger: true })) await repo.removeSet(r.id); }}><Icon name="trash" size={18} /></button>
                  </div>
                ))}
                <button className="btn small" onClick={async () => { const last = working[working.length - 1]; const n = await repo.addSet(id, ex, 'working', last?.weightKg ?? null, last?.reps ?? null); await repo.saveSet({ ...n, completed: true, completedAt: Date.now() }); }}><Icon name="plus" size={16} /> Add set</button>
                <div className="field"><label htmlFor={`en-${ex.uid}`}>Notes</label><textarea id={`en-${ex.uid}`} value={ex.notes} onChange={(e) => repo.updateSessionExercise(id, ex.uid, { notes: e.target.value })} /></div>
              </>
            )}
          </div>
        );
      })}

      <div className="card stack">
        {edit ? <div className="field"><label htmlFor="hno">Workout notes</label><textarea id="hno" value={s.notes} onChange={(e) => patchSession({ notes: e.target.value })} /></div>
          : <><span className="label">Workout notes</span><p className="small">{s.notes || <span className="muted">No notes.</span>}</p></>}
      </div>

      {edit ? <button className="btn primary block" onClick={done}>Save changes</button> : (
        <div className="grid2">
          <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={18} /> Edit</button>
          <button className="btn" onClick={async () => { if (active) { toast('Finish your current workout first'); return; } await repo.duplicateSession(id); toast('Copied as a new workout'); go('workout'); }}><Icon name="copy" size={18} /> Duplicate</button>
        </div>
      )}
      <button className="btn danger block" onClick={async () => {
        if (await confirm({ title: 'Delete this workout?', body: `“${s.name}” on ${fmtDate(s.startedAt)} and all of its sets will be permanently deleted. This can’t be undone; export a backup first if unsure.`, confirmLabel: 'Delete workout', danger: true })) {
          await repo.deleteSession(id); toast('Workout deleted'); onBack();
        }
      }}>Delete workout</button>
      <span className="sr-only">{fmtWeight(0, unit)}</span>
    </div>
  );
}
