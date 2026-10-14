import { useState } from 'react';
import { useApp } from '../ctx';
import { deleteTemplate, saveTemplate } from '../db/repo';
import { estimateDurationSec } from '../engine/volume';
import { uid, fmtMinutes, WEEKDAYS, muscleLabel } from '../lib/util';
import { Icon } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { updateSettings } from '../db/repo';
import type { TemplateExercise, WorkoutTemplate } from '../types';

export default function PlanEditor({ templateId, onBack, onStart }: { templateId: string; onBack: () => void; onStart: (t: WorkoutTemplate) => void }) {
  const { templates, exMap, settings, confirm, toast } = useApp();
  const t = templates.find((x) => x.id === templateId);
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'swap'; uid: string }>(null);
  if (!t) return <div className="stack"><button className="back" onClick={onBack}><Icon name="back" size={18} /> Back</button><p className="muted">This workout no longer exists.</p></div>;

  const save = (patch: Partial<WorkoutTemplate>) => saveTemplate({ ...t, ...patch });
  const updEx = (u: string, patch: Partial<TemplateExercise>) => save({ exercises: t.exercises.map((e) => (e.uid === u ? { ...e, ...patch } : e)) });
  const move = (i: number, d: number) => {
    const arr = [...t.exercises]; const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    void save({ exercises: arr });
  };
  const days = settings.schedule.map((id, i) => (id === t.id ? WEEKDAYS[i] : null)).filter(Boolean);
  const toggleDay = (i: number) => {
    const next = [...settings.schedule];
    next[i] = next[i] === t.id ? null : t.id;
    void updateSettings({ schedule: next });
  };
  const musclesHit = Array.from(new Set(t.exercises.map((e) => exMap.get(e.exerciseId)?.primary).filter(Boolean) as string[]));

  return (
    <div className="stack">
      <button className="back" onClick={onBack}><Icon name="back" size={18} /> Workouts</button>
      <div className="card stack">
        <div className="field"><label htmlFor="tn">Name</label><input id="tn" type="text" value={t.name} onChange={(e) => save({ name: e.target.value })} /></div>
        <div className="field"><label htmlFor="tf">Focus</label><input id="tf" type="text" value={t.focus} onChange={(e) => save({ focus: e.target.value })} placeholder="e.g. Back width, biceps, rear delts" /></div>
        <div className="field"><span className="label">Training days</span>
          <div className="chips">{WEEKDAYS.map((d, i) => <button key={d} className="chip" aria-pressed={settings.schedule[i] === t.id} onClick={() => toggleDay(i)}>{d}</button>)}</div></div>
        <div className="small muted">~{fmtMinutes(estimateDurationSec(t, exMap, { compound: settings.restCompoundSec, isolation: settings.restIsolationSec }))} · {t.exercises.reduce((s, e) => s + e.sets, 0)} sets · {musclesHit.map(muscleLabel).join(', ') || 'no exercises'}{days.length ? '' : ' · not scheduled'}</div>
      </div>

      {t.exercises.map((te, i) => {
        const ex = exMap.get(te.exerciseId);
        return (
          <div className="card stack" key={te.uid}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="grow"><div className="ex-name">{ex?.name ?? 'Missing exercise'}</div><div className="small muted">{ex ? `${muscleLabel(ex.primary)} · ${ex.equipment}` : ''}</div></div>
              <div className="row" style={{ gap: 0 }}>
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
                <button className="icon-btn" aria-label="Move down" disabled={i === t.exercises.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
              </div>
            </div>
            <div className="grid3">
              <div className="field"><label htmlFor={`s${te.uid}`}>Sets</label><input id={`s${te.uid}`} type="number" inputMode="numeric" min={1} max={10} value={te.sets} onChange={(e) => updEx(te.uid, { sets: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} /></div>
              <div className="field"><label htmlFor={`a${te.uid}`}>Min reps</label><input id={`a${te.uid}`} type="number" inputMode="numeric" min={1} max={100} value={te.repMin} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); updEx(te.uid, { repMin: v, repMax: Math.max(v, te.repMax) }); }} /></div>
              <div className="field"><label htmlFor={`b${te.uid}`}>Max reps</label><input id={`b${te.uid}`} type="number" inputMode="numeric" min={1} max={100} value={te.repMax} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); updEx(te.uid, { repMax: v, repMin: Math.min(v, te.repMin) }); }} /></div>
            </div>
            <div className="field"><label htmlFor={`r${te.uid}`}>Rest (seconds) — leave empty for the exercise default ({ex?.restSec ?? 90}s)</label>
              <input id={`r${te.uid}`} type="number" inputMode="numeric" min={15} max={600} value={te.restSec ?? ''} placeholder={String(ex?.restSec ?? 90)} onChange={(e) => updEx(te.uid, { restSec: e.target.value ? Math.max(15, Math.min(600, Number(e.target.value))) : undefined })} /></div>
            <div className="row">
              <button className="btn small grow" onClick={() => setPicker({ mode: 'swap', uid: te.uid })}><Icon name="swap" size={16} /> Substitute</button>
              <button className="btn small danger" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={() => save({ exercises: t.exercises.filter((e) => e.uid !== te.uid) })}><Icon name="trash" size={16} /></button>
            </div>
          </div>
        );
      })}

      <button className="btn block" onClick={() => setPicker({ mode: 'add' })}><Icon name="plus" size={18} /> Add exercise</button>
      <button className="btn primary block" disabled={t.exercises.length === 0} onClick={() => onStart(t)}>Start this workout</button>
      <button className="btn danger block" onClick={async () => {
        if (await confirm({ title: `Delete “${t.name}”?`, body: 'The workout plan is removed and unscheduled. Sessions you already logged stay in History.', confirmLabel: 'Delete plan', danger: true })) {
          await deleteTemplate(t.id); toast('Plan deleted'); onBack();
        }
      }}>Delete plan</button>

      {picker && (
        <ExercisePicker
          title={picker.mode === 'add' ? 'Add exercise' : 'Substitute exercise'}
          suggestedIds={picker.mode === 'swap' ? exMap.get(t.exercises.find((e) => e.uid === picker.uid)?.exerciseId ?? '')?.alternatives : undefined}
          onClose={() => setPicker(null)}
          onPick={(ex) => {
            if (picker.mode === 'add') void save({ exercises: [...t.exercises, { uid: uid(), exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12 }] });
            else void updEx(picker.uid, { exerciseId: ex.id });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
