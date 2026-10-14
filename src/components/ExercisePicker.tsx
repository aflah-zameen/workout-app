import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { newCustomExercise, saveExercise } from '../db/repo';
import { MUSCLES, type ExerciseDef, type LoadMode, type Muscle } from '../types';
import { muscleLabel } from '../lib/util';
import { fromDisplay, incrementFor, toDisplay } from '../lib/units';
import { Sheet } from './ui';
import { ALTERNATIVE_NOTE } from '../data/seed';

export function ExerciseForm({ initial, onSave, onClose }: { initial?: ExerciseDef; onSave: (e: ExerciseDef) => void; onClose: () => void }) {
  const { settings } = useApp();
  const [ex, setEx] = useState<ExerciseDef>(initial ?? newCustomExercise(''));
  const inc = toDisplay(ex.incrementKg, settings.unit);
  const set = (p: Partial<ExerciseDef>) => setEx({ ...ex, ...p });
  const valid = ex.name.trim().length > 0;
  return (
    <Sheet label={initial ? 'Edit exercise' : 'New exercise'} onClose={onClose}>
      <div className="stack">
        <h2 className="section-title">{initial ? 'Edit exercise' : 'New exercise'}</h2>
        <div className="field"><label htmlFor="exn">Name</label><input id="exn" type="text" value={ex.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Cable row (close grip)" autoFocus={!initial} /></div>
        <div className="field"><label htmlFor="exm">Main muscle</label>
          <select id="exm" value={ex.primary} onChange={(e) => set({ primary: e.target.value as Muscle })}>{MUSCLES.map((m) => <option key={m} value={m}>{muscleLabel(m)}</option>)}</select></div>
        <div className="field"><span className="label">Also works (counts as half a set)</span>
          <div className="chips">{MUSCLES.filter((m) => m !== ex.primary).map((m) => (
            <button key={m} className="chip" aria-pressed={ex.secondary.includes(m)} onClick={() => set({ secondary: ex.secondary.includes(m) ? ex.secondary.filter((x) => x !== m) : [...ex.secondary, m] })}>{muscleLabel(m)}</button>
          ))}</div></div>
        <div className="field"><label htmlFor="exl">How it’s loaded</label>
          <select id="exl" value={ex.loadMode} onChange={(e) => set({ loadMode: e.target.value as LoadMode })}>
            <option value="external">Weight (barbell, machine, cable, dumbbell)</option>
            <option value="bodyweight">Bodyweight, with optional added weight</option>
            <option value="assisted">Assisted (machine or band reduces load)</option>
          </select></div>
        <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={ex.perHand} onChange={(e) => set({ perHand: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} /><span>Weight is logged per hand (dumbbells)</span></label>
        <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={ex.compound} onChange={(e) => set({ compound: e.target.checked, restSec: e.target.checked ? Math.max(ex.restSec, 120) : Math.min(ex.restSec, 90) })} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} /><span>Demanding compound lift (longer rest)</span></label>
        <div className="grid2">
          <div className="field"><label htmlFor="exi">Smallest jump ({settings.unit})</label>
            <input id="exi" type="number" inputMode="decimal" step="0.25" min="0.25" value={inc} onChange={(e) => { const v = Number(e.target.value); if (v > 0) set({ incrementKg: fromDisplay(v, settings.unit) }); }} /></div>
          <div className="field"><label htmlFor="exr">Rest (seconds)</label>
            <input id="exr" type="number" inputMode="numeric" min="15" max="600" value={ex.restSec} onChange={(e) => set({ restSec: Math.max(15, Math.min(600, Number(e.target.value) || 60)) })} /></div>
        </div>
        <div className="field"><label htmlFor="exq">Equipment (optional)</label><input id="exq" type="text" value={ex.equipment} onChange={(e) => set({ equipment: e.target.value })} /></div>
        <button className="btn primary block" disabled={!valid} onClick={() => onSave({ ...ex, name: ex.name.trim(), incrementKg: ex.incrementKg > 0 ? ex.incrementKg : 2.5 })}>Save exercise</button>
      </div>
    </Sheet>
  );
}

export function ExercisePicker({ title, suggestedIds, excludeIds, onPick, onClose }: {
  title: string; suggestedIds?: string[]; excludeIds?: string[]; onPick: (e: ExerciseDef) => void; onClose: () => void;
}) {
  const { exercises, exMap, settings } = useApp();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return exercises.filter((e) => !e.archived && !excludeIds?.includes(e.id) && (!ql || e.name.toLowerCase().includes(ql) || e.primary.includes(ql) || e.equipment.toLowerCase().includes(ql)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, q, excludeIds]);
  const suggested = (suggestedIds ?? []).map((id) => exMap.get(id)).filter((e): e is ExerciseDef => !!e && !e.archived);

  const row = (e: ExerciseDef) => (
    <button key={e.id} className="item" onClick={() => onPick(e)}>
      <div className="main"><div className="title">{e.name}</div><div className="small muted">{muscleLabel(e.primary)} · {e.equipment || 'Any equipment'} · +{incrementFor(e.incrementKg, settings.unit)} {settings.unit}</div></div>
    </button>
  );
  if (creating) return <ExerciseForm onClose={() => setCreating(false)} onSave={async (e) => { await saveExercise(e); onPick(e); }} />;
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="stack">
        <h2 className="section-title">{title}</h2>
        {suggested.length > 0 && !q && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Suggested alternatives</span>
            <div className="list">{suggested.map(row)}</div>
            <p className="tiny muted">{ALTERNATIVE_NOTE}</p>
          </div>
        )}
        <div className="row"><input type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" /></div>
        <button className="btn block" onClick={() => setCreating(true)}>Create custom exercise</button>
        <div className="list">{list.map(row)}</div>
        {list.length === 0 && <p className="small muted">No match. Create it as a custom exercise.</p>}
      </div>
    </Sheet>
  );
}
