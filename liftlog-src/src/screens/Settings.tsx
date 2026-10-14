import { useRef, useState } from 'react';
import { useApp } from '../ctx';
import * as repo from '../db/repo';
import { backupFilename, BackupError, exportBackup, importBackup, validateBackup } from '../db/backup';
import { Icon, Segmented, Sheet } from '../components/ui';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { ExerciseForm } from '../components/ExercisePicker';
import { fromDisplay, toDisplay } from '../lib/units';
import { muscleLabel } from '../lib/util';
import type { ExerciseDef, ProgressionRule } from '../types';

const Toggle = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="row between" style={{ minHeight: 48 }}>
    <span className="grow"><span style={{ fontWeight: 600 }}>{label}</span>{hint && <span className="tiny muted" style={{ display: 'block' }}>{hint}</span>}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 26, height: 26, accentColor: 'var(--accent)' }} />
  </label>
);

export default function Settings() {
  const { settings, exercises, completed, toast, confirm } = useApp();
  const [lib, setLib] = useState<ExerciseDef | 'new' | null>(null);
  const [showLib, setShowLib] = useState(false);
  const [ruleEx, setRuleEx] = useState('');
  const [preview, setPreview] = useState<null | { raw: unknown; counts: Record<string, number>; warnings: string[]; name: string }>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [storage, setStorage] = useState<string>('');
  const file = useRef<HTMLInputElement>(null);
  const upd = (p: Parameters<typeof repo.updateSettings>[0]) => repo.updateSettings(p);

  const doExport = async () => {
    const data = await exportBackup();
    const json = JSON.stringify(data, null, 2);
    const name = backupFilename();
    const f = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: 'Liftlog backup' }); toast('Backup ready'); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    const url = URL.createObjectURL(f);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup downloaded');
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(await exportBackup())); toast('Backup copied to clipboard'); } catch { toast('Copy failed; use Export instead'); }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const v = validateBackup(raw);
      setPreview({ raw, counts: v.counts, warnings: v.warnings, name: f.name });
    } catch (e) {
      const msg = e instanceof BackupError ? e.message : e instanceof SyntaxError ? 'That file is not valid JSON.' : 'The file could not be read.';
      await confirm({ title: 'Import failed', body: msg + ' Nothing was changed.', confirmLabel: 'OK', cancelLabel: 'Close' });
    } finally { if (file.current) file.current.value = ''; }
  };
  const runImport = async (mode: 'merge' | 'replace') => {
    if (!preview) return;
    if (mode === 'replace' && !(await confirm({ title: 'Replace all data?', body: 'Everything currently in Liftlog is erased and replaced by this backup. Export a backup first if unsure.', confirmLabel: 'Replace', danger: true }))) return;
    try {
      const r = await importBackup(preview.raw, mode);
      toast(`Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} unchanged`);
      setPreview(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'Import failed'); }
  };
  const checkStorage = async () => {
    try {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage(`${persisted ? 'Protected from automatic cleanup' : 'Not yet protected'} · using ${((est?.usage ?? 0) / 1024 / 1024).toFixed(1)} MB`);
    } catch { setStorage('Storage info unavailable'); }
  };
  const protect = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'Storage protected' : 'Your browser declined; keep regular backups');
    await checkStorage();
  };

  const rule: ProgressionRule = (ruleEx && settings.rules[ruleEx]) || { mode: 'suggest' };
  const setRule = (p: Partial<ProgressionRule>) => upd({ rules: { ...settings.rules, [ruleEx]: { ...rule, ...p } } });
  const ruleDef = exercises.find((e) => e.id === ruleEx);

  return (
    <div className="stack">
      <div><h1 className="page-title">Settings</h1></div>

      <div className="card stack">
        <h2 className="section-title">Units and theme</h2>
        <div className="field"><span className="label">Weight unit</span><Segmented label="Weight unit" value={settings.unit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} onChange={(v) => upd({ unit: v })} /></div>
        <p className="tiny muted">Weights are stored in kilograms internally. Switching units only changes how they are shown; logged history is never rewritten.</p>
        <div className="field"><span className="label">Theme</span><Segmented label="Theme" value={settings.theme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} onChange={(v) => upd({ theme: v })} /></div>
      </div>

      <div className="card stack"><h2 className="section-title">Training days</h2><ScheduleEditor /></div>

      <div className="card stack">
        <h2 className="section-title">Rest timer</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="rc">Compound (sec)</label><input id="rc" type="number" inputMode="numeric" min={15} max={600} value={settings.restCompoundSec} onChange={(e) => upd({ restCompoundSec: Math.max(15, Math.min(600, Number(e.target.value) || 150)) })} /></div>
          <div className="field"><label htmlFor="ri">Isolation (sec)</label><input id="ri" type="number" inputMode="numeric" min={15} max={600} value={settings.restIsolationSec} onChange={(e) => upd({ restIsolationSec: Math.max(15, Math.min(600, Number(e.target.value) || 90)) })} /></div>
        </div>
        <Toggle label="Start automatically" hint="Otherwise Liftlog offers to start it after each set." checked={settings.autoStartTimer} onChange={(v) => upd({ autoStartTimer: v })} />
        <Toggle label="Sound when rest ends" checked={settings.timerSound} onChange={(v) => upd({ timerSound: v })} />
      </div>

      <div className="card stack">
        <h2 className="section-title">Progression</h2>
        <Toggle label="Suggest load increases" hint="Suggestions are never applied without your approval." checked={settings.progressionEnabled} onChange={(v) => upd({ progressionEnabled: v })} />
        <div className="field"><span className="label">Sessions at the top of the rep range before adding load</span><Segmented label="Sessions at top" value={settings.sessionsAtTop} options={[{ value: 1, label: '1 session' }, { value: 2, label: '2 sessions' }]} onChange={(v) => upd({ sessionsAtTop: v })} /></div>
        <div className="field"><span className="label">Hold back if average reps in reserve is below</span><Segmented label="Minimum RIR" value={settings.minAvgRir} options={[{ value: 0, label: 'Off' }, { value: 1, label: '1' }, { value: 2, label: '2' }]} onChange={(v) => upd({ minAvgRir: v })} /></div>
        <div className="field"><label htmlFor="dl">Suggest a deload every (weeks)</label><input id="dl" type="number" inputMode="numeric" min={3} max={16} value={settings.deloadEveryWeeks} onChange={(e) => upd({ deloadEveryWeeks: Math.max(3, Math.min(16, Number(e.target.value) || 6)) })} /></div>
        <div className="field"><label htmlFor="re">Custom rule for one exercise</label>
          <select id="re" value={ruleEx} onChange={(e) => setRuleEx(e.target.value)}><option value="">Choose exercise…</option>{exercises.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        {ruleEx && (
          <div className="stack">
            <Segmented label="Rule mode" value={rule.mode} options={[{ value: 'suggest', label: 'Suggest' }, { value: 'off', label: 'No suggestions' }]} onChange={(v) => setRule({ mode: v })} />
            <div className="grid2">
              <div className="field"><label htmlFor="ri2">Jump ({settings.unit})</label><input id="ri2" type="number" inputMode="decimal" step="0.25" min="0.25" placeholder={String(toDisplay(ruleDef?.incrementKg ?? 2.5, settings.unit))} value={rule.incrementKg != null ? toDisplay(rule.incrementKg, settings.unit) : ''} onChange={(e) => setRule({ incrementKg: e.target.value && Number(e.target.value) > 0 ? fromDisplay(Number(e.target.value), settings.unit) : undefined })} /></div>
              <div className="field"><label htmlFor="rs">Sessions at top</label><input id="rs" type="number" inputMode="numeric" min={1} max={4} placeholder={String(settings.sessionsAtTop)} value={rule.sessionsAtTop ?? ''} onChange={(e) => setRule({ sessionsAtTop: e.target.value ? Math.max(1, Math.min(4, Number(e.target.value))) : undefined })} /></div>
            </div>
            <button className="btn small ghost" onClick={() => { const r = { ...settings.rules }; delete r[ruleEx]; void upd({ rules: r }); }}>Clear rule</button>
          </div>
        )}
      </div>

      <div className="card stack">
        <button className="row between" onClick={() => setShowLib(!showLib)} aria-expanded={showLib}><h2 className="section-title">Exercise library</h2><span className="small muted">{exercises.filter((e) => !e.archived).length} exercises</span></button>
        {showLib && (
          <>
            <button className="btn small" onClick={() => setLib('new')}><Icon name="plus" size={16} /> New exercise</button>
            <div className="list">{[...exercises].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
              <div className="item" key={e.id} style={{ opacity: e.archived ? 0.5 : 1 }}>
                <button className="main" style={{ textAlign: 'left' }} onClick={() => setLib(e)}><div className="title">{e.name}</div><div className="small muted">{muscleLabel(e.primary)}{e.custom ? ' · custom' : ''}{e.archived ? ' · hidden' : ''}</div></button>
                <button className="btn small ghost" onClick={() => repo.saveExercise({ ...e, archived: !e.archived })}>{e.archived ? 'Restore' : 'Hide'}</button>
              </div>))}</div>
            <p className="tiny muted">Renaming an exercise keeps your old workouts readable; they store the name they were logged with.</p>
          </>
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title">Your data</h2>
        <p className="small muted">Everything is stored on this device only. {completed.length} workouts saved.</p>
        <div className="grid2"><button className="btn" onClick={doExport}><Icon name="download" size={18} /> Export</button><button className="btn" onClick={() => file.current?.click()}><Icon name="upload" size={18} /> Import</button></div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose backup file" />
        <button className="btn small ghost" onClick={copyJson}>Copy backup to clipboard</button>
        <div className="row between"><span className="small muted">{storage || 'Storage status'}</span><button className="btn small ghost" onClick={storage ? protect : checkStorage}>{storage ? 'Protect storage' : 'Check'}</button></div>
        <p className="tiny muted">Safari can clear website data for apps you haven’t opened in a while. Keep an occasional backup in Files or iCloud Drive.</p>
        <button className="btn danger block" onClick={() => { setResetText(''); setResetOpen(true); }}>Erase all data…</button>
      </div>
      <p className="tiny muted" style={{ textAlign: 'center' }}>Liftlog 1.0 · works offline · no account needed</p>

      {lib && <ExerciseForm initial={lib === 'new' ? undefined : lib} onClose={() => setLib(null)} onSave={async (e) => { await repo.saveExercise(e); setLib(null); toast('Exercise saved'); }} />}
      {preview && (
        <Sheet label="Import backup" onClose={() => setPreview(null)}>
          <div className="stack">
            <h2 className="section-title">Backup looks valid</h2>
            <p className="small muted">{preview.name}</p>
            <div className="grid2">{Object.entries(preview.counts).map(([k, v]) => <div className="card tight stat" key={k}><span className="v num">{v}</span><span className="l">{k}</span></div>)}</div>
            {preview.warnings.map((w) => <p className="small" style={{ color: 'var(--warn)' }} key={w}>{w}</p>)}
            <button className="btn primary block" onClick={() => runImport('merge')}>Merge into current data</button>
            <p className="tiny muted" style={{ marginTop: -6 }}>Adds what’s missing and keeps the newer version of anything that exists twice. No duplicates.</p>
            <button className="btn danger block" onClick={() => runImport('replace')}>Replace everything</button>
          </div>
        </Sheet>
      )}
      {resetOpen && (
        <Sheet center label="Erase all data" onClose={() => setResetOpen(false)}>
          <div className="stack">
            <h2 className="section-title">Erase all data?</h2>
            <p className="small muted">This permanently deletes every workout, set, body-weight entry and custom exercise on this device, and restores the default plan. Export a backup first if there’s any doubt. Type <b>RESET</b> to confirm.</p>
            <input type="text" aria-label="Type RESET to confirm" value={resetText} onChange={(e) => setResetText(e.target.value)} autoCapitalize="characters" />
            <div className="row"><button className="btn grow" onClick={() => setResetOpen(false)}>Cancel</button>
              <button className="btn danger grow" disabled={resetText.trim() !== 'RESET'} onClick={async () => { await repo.resetAllData(); setResetOpen(false); toast('All data erased'); }}>Erase</button></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
