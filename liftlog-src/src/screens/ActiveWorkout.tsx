import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../ctx';
import * as repo from '../db/repo';
import { adviseProgression } from '../engine/progression';
import { buildExerciseHistory, type ExerciseSessionHistory } from '../engine/history';
import { warmupRamp } from '../engine/warmup';
import { describeSets } from '../engine/progression';
import { fmtDuration, relativeDay } from '../lib/util';
import { fromDisplay, fmtWeight, incrementFor, toDisplay } from '../lib/units';
import { Icon, NumInput, Sheet, useInterval } from '../components/ui';
import { TimerBar, TimerSheet, unlockAudio, useRestTimer } from '../components/RestTimer';
import { ExercisePicker } from '../components/ExercisePicker';
import type { ExerciseDef, SessionExercise, SetEntry, Unit } from '../types';

const RIR_CYCLE: (number | null)[] = [null, 3, 2, 1, 0];

export function weightHeader(ex: SessionExercise, unit: Unit): string {
  if (ex.loadModeSnapshot === 'bodyweight') return `+${unit}${ex.perHandSnapshot ? '/hand' : ''}`;
  if (ex.loadModeSnapshot === 'assisted') return `assist ${unit}`;
  return `${unit}${ex.perHandSnapshot ? '/hand' : ''}`;
}

export default function ActiveWorkout({ onFinished }: { onFinished: (id: string) => void }) {
  const app = useApp();
  const { active, settings, completed, sets: histSets, exMap, toast, confirm } = app;
  const unit = settings.unit;
  const rest = useRestTimer();
  const [timerSheet, setTimerSheet] = useState<null | { sec: number; label: string }>(null);
  const [suggest, setSuggest] = useState<null | { sec: number; label: string }>(null);
  const [adding, setAdding] = useState(false);
  const [swapUid, setSwapUid] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 1000);

  const sessionId = active?.id ?? '';
  const mySets = useLiveQuery(() => (sessionId ? db.sets.where('sessionId').equals(sessionId).toArray() : []), [sessionId]);

  // Keep the screen awake while logging (optional, ignored where unsupported).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* denied */ }
    };
    void req();
    const vis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, []);

  const history = useMemo(() => {
    const m = new Map<string, ExerciseSessionHistory[]>();
    for (const ex of active?.exercises ?? []) m.set(ex.exerciseId, buildExerciseHistory(completed, histSets, ex.exerciseId));
    return m;
  }, [active?.exercises, completed, histSets]);

  if (!active || !mySets) return null;

  const rowsFor = (uid: string) => mySets.filter((s) => s.exerciseUid === uid).sort((a, b) => a.index - b.index);
  const doneWorking = mySets.filter((s) => s.completed && s.kind === 'working').length;
  const totalWorking = mySets.filter((s) => s.kind === 'working').length;
  const elapsed = Math.round((now - active.startedAt) / 1000);

  const complete = async (set: SetEntry, ex: SessionExercise, hist: ExerciseSessionHistory | undefined) => {
    unlockAudio();
    if (set.completed) { await repo.saveSet({ ...set, completed: false, completedAt: undefined }); return; }
    const idxWorking = rowsFor(ex.uid).filter((s) => s.kind === 'working').findIndex((s) => s.id === set.id);
    const prev = hist?.working[idxWorking] ?? hist?.working[hist.working.length - 1];
    let weight = set.weightKg ?? prev?.weightKg ?? null;
    if (weight == null && ex.loadModeSnapshot !== 'external') weight = 0;
    const reps = set.reps ?? prev?.reps ?? (set.kind === 'warmup' ? ex.repMin : null);
    if (weight == null) { toast('Enter the weight for this set'); return; }
    if (reps == null) { toast('Enter the reps for this set'); return; }
    await repo.saveSet({ ...set, weightKg: weight, reps, completed: true, completedAt: Date.now() });
    if (set.kind === 'working') {
      const def = exMap.get(ex.exerciseId);
      const sec = ex.restSec || (def?.compound ? settings.restCompoundSec : settings.restIsolationSec);
      if (settings.autoStartTimer) await rest.start(sec, ex.nameSnapshot);
      else setSuggest({ sec, label: ex.nameSnapshot });
    }
  };

  const finish = async () => {
    const info = await repo.countUnfinished(active.id);
    if (info.completedSets === 0) {
      if (await confirm({ title: 'Discard this workout?', body: 'No sets were logged, so there is nothing to save. The empty session will be removed.', confirmLabel: 'Discard', danger: true })) {
        await repo.discardSession(active.id); await repo.clearTimer();
      }
      return;
    }
    const ok = await confirm({
      title: 'Finish workout?',
      body: info.discardedSets > 0
        ? `${info.completedSets} sets logged. ${info.discardedSets} planned set${info.discardedSets === 1 ? ' was' : 's were'} not completed and will not be saved.`
        : `All ${info.completedSets} sets are logged.`,
      confirmLabel: 'Finish',
    });
    if (!ok) return;
    await repo.finishSession(active.id);
    await repo.clearTimer();
    onFinished(active.id);
  };

  return (
    <div className="stack">
      <div className="sticky-bar stack" style={{ gap: 8 }}>
        <div className="row between">
          <div className="grow"><div className="section-title ellip">{active.name}</div><div className="small muted num">{fmtDuration(elapsed)} · {doneWorking}/{totalWorking} sets{active.deload ? ' · deload' : ''}</div></div>
          <button className="btn small primary" onClick={finish}>Finish</button>
        </div>
        <TimerBar api={rest} onPick={() => setTimerSheet({ sec: rest.timer?.durationSec ?? 120, label: rest.timer?.label ?? 'Rest' })} />
        {suggest && !rest.timer && (
          <div className="advice row between">
            <span>Start a {fmtDuration(suggest.sec)} rest?</span>
            <span className="row"><button className="btn small primary" onClick={() => { void rest.start(suggest.sec, suggest.label); setSuggest(null); }}>Start</button><button className="icon-btn" aria-label="Dismiss" onClick={() => setSuggest(null)}><Icon name="x" size={18} /></button></span>
          </div>
        )}
      </div>

      {active.exercises.map((ex) => (
        <ExerciseCard key={ex.uid} ex={ex} rows={rowsFor(ex.uid)} hist={history.get(ex.exerciseId) ?? []} unit={unit}
          def={exMap.get(ex.exerciseId)} onComplete={(s, h) => complete(s, ex, h)} onSwap={() => setSwapUid(ex.uid)} sessionId={active.id}
          openTimer={() => setTimerSheet({ sec: ex.restSec, label: ex.nameSnapshot })} />
      ))}

      <button className="btn block" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add exercise</button>
      <div className="field"><label htmlFor="wn">Workout notes</label><textarea id="wn" value={active.notes} placeholder="How did it feel? Anything to remember?" onChange={(e) => repo.updateSession(active.id, { notes: e.target.value })} /></div>

      {timerSheet && <TimerSheet api={rest} defaultSec={timerSheet.sec} label={timerSheet.label} onClose={() => setTimerSheet(null)} />}
      {adding && <ExercisePicker title="Add exercise" onClose={() => setAdding(false)} onPick={async (e) => { await repo.addExerciseToSession(active.id, e.id); setAdding(false); }} />}
      {swapUid && (() => {
        const cur = active.exercises.find((e) => e.uid === swapUid)!;
        const hasLogged = rowsFor(swapUid).some((s) => s.completed);
        if (hasLogged) {
          return (
            <Sheet center label="Substitute" onClose={() => setSwapUid(null)}>
              <div className="stack"><h2 className="section-title">Sets already logged</h2><p className="small muted">To keep your history accurate, a substitute can’t replace an exercise once sets are logged. Add the alternative as a new exercise instead.</p>
                <button className="btn primary block" onClick={() => { setSwapUid(null); setAdding(true); }}>Add as new exercise</button></div>
            </Sheet>
          );
        }
        return <ExercisePicker title={`Substitute ${cur.nameSnapshot}`} suggestedIds={exMap.get(cur.exerciseId)?.alternatives} excludeIds={[cur.exerciseId]} onClose={() => setSwapUid(null)}
          onPick={async (e) => { await repo.swapExercise(active.id, swapUid, e.id); toast(`Switched to ${e.name}`); setSwapUid(null); }} />;
      })()}
    </div>
  );
}

function ExerciseCard({ ex, rows, hist, unit, def, onComplete, onSwap, sessionId, openTimer }: {
  ex: SessionExercise; rows: SetEntry[]; hist: ExerciseSessionHistory[]; unit: Unit; def?: ExerciseDef;
  onComplete: (s: SetEntry, h: ExerciseSessionHistory | undefined) => void; onSwap: () => void; sessionId: string; openTimer: () => void;
}) {
  const { settings, confirm, toast } = useApp();
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(!!ex.notes);
  const [why, setWhy] = useState(false);
  const last = hist[0];
  const working = rows.filter((r) => r.kind === 'working');
  const incKg = def?.incrementKg ?? 2.5;
  const step = incrementFor(incKg, unit);
  const mode = ex.loadModeSnapshot;

  const advice = useMemo(() => adviseProgression({
    exercise: { id: ex.exerciseId, name: ex.nameSnapshot, loadMode: mode, incrementKg: incKg, perHand: ex.perHandSnapshot },
    repMin: ex.repMin, repMax: ex.repMax, targetSets: ex.targetSets, history: hist, settings, unit,
  }), [ex, hist, settings, unit, mode, incKg]);

  const patch = (s: SetEntry, p: Partial<SetEntry>) => repo.saveSet({ ...s, ...p });
  const applyAdvice = async () => {
    if (advice.suggestedWeightKg == null) return;
    for (const s of working.filter((r) => !r.completed)) await patch(s, { weightKg: advice.suggestedWeightKg! });
    toast(`Loads set to ${fmtWeight(advice.suggestedWeightKg, unit, true)}`);
  };
  const addWarmups = async () => {
    const w = working[0]?.weightKg ?? last?.working[0]?.weightKg ?? 0;
    const ramp = warmupRamp(w, unit, incKg);
    if (!ramp.length) { await repo.addSet(sessionId, ex, 'warmup', null, null); return; }
    for (const r of ramp) await repo.addSet(sessionId, ex, 'warmup', r.weightKg, r.reps);
  };
  const anyDone = rows.some((r) => r.completed);
  const labelNo = (s: SetEntry) => (s.kind === 'warmup' ? 'W' : String(working.findIndex((x) => x.id === s.id) + 1));

  return (
    <section className="ex-card stack" aria-label={ex.nameSnapshot}>
      <div className="ex-head">
        <div className="grow">
          <div className="ex-name">{ex.nameSnapshot}</div>
          <div className="small muted">{ex.targetSets} × {ex.repMin}–{ex.repMax} · rest {fmtDuration(ex.restSec)}{ex.swappedFrom && ex.swappedFrom !== ex.exerciseId ? ' · substituted' : ''}</div>
        </div>
        <button className="icon-btn" aria-label="Exercise options" aria-expanded={menu} onClick={() => setMenu(!menu)}><span style={{ fontSize: 22, lineHeight: 1 }}>⋯</span></button>
      </div>

      <div className="prev">{last ? <>Last time ({relativeDay(last.startedAt)}): <span className="num" style={{ color: 'var(--text)' }}>{describeSets(last.working, unit, mode)}</span></> : 'No previous session for this exercise'}</div>

      {advice.status !== 'off' && advice.status !== 'insufficient' && (
        <div className={'advice' + (advice.status === 'decline' ? ' warn' : '')}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600 }}>{advice.headline}</span>
            <button className="small muted" style={{ minHeight: 32, textDecoration: 'underline', flexShrink: 0 }} onClick={() => setWhy(!why)} aria-expanded={why}>Why?</button>
          </div>
          {why && <ul className="why" style={{ paddingLeft: 18, margin: '6px 0 0' }}>{advice.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {advice.status === 'increase' && <button className="btn small primary" style={{ marginTop: 8 }} onClick={applyAdvice}>Use {fmtWeight(advice.suggestedWeightKg, unit, true)}</button>}
        </div>
      )}

      {menu && (
        <div className="row wrap">
          <button className="btn small" onClick={() => repo.addSet(sessionId, ex, 'working', working[working.length - 1]?.weightKg ?? null)}><Icon name="plus" size={16} /> Set</button>
          <button className="btn small" onClick={addWarmups}>Warm-up sets</button>
          <button className="btn small" onClick={() => setNotes(!notes)}><Icon name="note" size={16} /> Notes</button>
          <button className="btn small" onClick={openTimer}><Icon name="timer" size={16} /> Timer</button>
          <button className="btn small" onClick={onSwap}><Icon name="swap" size={16} /> Substitute</button>
          {working.length > 1 && <button className="btn small" onClick={async () => { const l = [...working].reverse().find((s) => !s.completed) ?? working[working.length - 1]; if (l.completed && !(await confirm({ title: 'Remove a logged set?', body: 'This set was already logged and will be deleted.', confirmLabel: 'Remove', danger: true }))) return; await repo.removeSet(l.id); }}>Remove set</button>}
          {!anyDone && <button className="btn small danger" onClick={async () => { if (await confirm({ title: `Remove ${ex.nameSnapshot}?`, body: 'It has no logged sets, so nothing in your history changes.', confirmLabel: 'Remove', danger: true })) await repo.removeExerciseFromSession(sessionId, ex.uid); }}>Remove exercise</button>}
        </div>
      )}
      {menu && <p className="tiny muted">If something hurts, swap the exercise rather than pushing through. Warm-up sets are logged separately and never count toward volume.</p>}

      <div>
        <div className="set-head"><span>Set</span><span>{weightHeader(ex, unit)}</span><span>Reps</span><span title="Reps in reserve">RIR</span><span>Done</span></div>
        {rows.map((s) => {
          const wi = s.kind === 'working' ? working.findIndex((x) => x.id === s.id) : -1;
          const prev = wi >= 0 ? (last?.working[wi] ?? last?.working[last.working.length - 1]) : undefined;
          return (
            <div className={'set-row' + (s.completed ? ' done' : '')} key={s.id}>
              <span className={'set-no' + (s.kind === 'warmup' ? ' w' : '')} aria-label={s.kind === 'warmup' ? 'Warm-up set' : `Set ${labelNo(s)}`}>{labelNo(s)}</span>
              <NumInput label={`Set ${labelNo(s)} weight`} step={step} value={s.weightKg == null ? null : toDisplay(s.weightKg, unit)}
                placeholder={prev?.weightKg != null ? String(toDisplay(prev.weightKg, unit)) : mode === 'external' ? '–' : '0'}
                onChange={(v) => patch(s, { weightKg: v == null ? null : fromDisplay(v, unit) })} />
              <NumInput label={`Set ${labelNo(s)} reps`} step={1} decimals={false} max={200} value={s.reps}
                placeholder={prev?.reps != null ? String(prev.reps) : s.kind === 'warmup' ? String(ex.repMin) : `${ex.repMin}–${ex.repMax}`}
                onChange={(v) => patch(s, { reps: v == null ? null : Math.round(v) })} />
              <button className={'rir-btn' + (s.rir != null ? ' set' : '')} aria-label={`Reps in reserve for set ${labelNo(s)}: ${s.rir ?? 'not set'}. Tap to change`}
                disabled={s.kind === 'warmup'} onClick={() => patch(s, { rir: RIR_CYCLE[(RIR_CYCLE.indexOf(s.rir) + 1) % RIR_CYCLE.length] })}>{s.kind === 'warmup' ? '' : s.rir ?? '–'}</button>
              <button className={'check' + (s.completed ? ' on' : '')} aria-pressed={s.completed} aria-label={s.completed ? `Set ${labelNo(s)} logged. Tap to edit` : `Log set ${labelNo(s)}`}
                onClick={() => onComplete(s, last)}><Icon name="check" size={26} stroke={3} /></button>
            </div>
          );
        })}
      </div>
      {notes && <div className="field"><label htmlFor={`n-${ex.uid}`}>Exercise notes</label><textarea id={`n-${ex.uid}`} value={ex.notes} placeholder="Seat height, grip, cues…" onChange={(e) => repo.updateSessionExercise(sessionId, ex.uid, { notes: e.target.value })} /></div>}
    </section>
  );
}
