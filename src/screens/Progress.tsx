import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { buildExerciseHistory, bestE1RM, topSet, totalReps } from '../engine/history';
import { recordEvents } from '../engine/records';
import { muscleSetsSplit, plannedWeeklySets, VOLUME_BANDS, volumeLabel } from '../engine/volume';
import { DAY, fmtDate, localDateStr, muscleLabel, startOfWeek } from '../lib/util';
import { fmtWeight, fromDisplay, toDisplay } from '../lib/units';
import { deleteBodyWeight, saveBodyWeight } from '../db/repo';
import { ColumnChart, LineChart, type Point } from '../components/Charts';
import { Empty, Icon, Segmented } from '../components/ui';
import { prLabel } from './Home';
import { MUSCLES } from '../types';

type Metric = 'e1rm' | 'top' | 'reps';

export default function Progress() {
  const { completed, sets, exMap, settings, templates, bodyweight, intent, toast, confirm } = useApp();
  const unit = settings.unit;
  const withData = useMemo(() => {
    const ids = new Set(sets.filter((s) => s.completed && s.kind === 'working').map((s) => s.exerciseId));
    return [...ids].map((id) => ({ id, name: exMap.get(id)?.name ?? completed.flatMap((s) => s.exercises).find((e) => e.exerciseId === id)?.nameSnapshot ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, exMap, completed]);
  const [exId, setExId] = useState<string>(intent.exerciseId ?? '');
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [weekOffset, setWeekOffset] = useState(0);
  const [bw, setBw] = useState('');
  const selected = exId || withData[0]?.id || '';
  const def = exMap.get(selected);
  const mode = def?.loadMode ?? completed.flatMap((s) => s.exercises).find((e) => e.exerciseId === selected)?.loadModeSnapshot ?? 'external';

  const hist = useMemo(() => (selected ? buildExerciseHistory(completed, sets, selected).reverse() : []), [completed, sets, selected]);
  const e1rmPoints: Point[] = hist.flatMap((h) => { const e = bestE1RM(h.working); return e == null ? [] : [{ x: h.startedAt, y: toDisplay(e, unit) }]; });
  const topPoints: Point[] = hist.map((h) => ({ x: h.startedAt, y: toDisplay(topSet(h.working, mode)?.weightKg ?? 0, unit) }));
  const repPoints: Point[] = hist.map((h) => ({ x: h.startedAt, y: totalReps(h.working) }));
  const effectiveMetric: Metric = metric === 'e1rm' && (mode !== 'external' || e1rmPoints.length < 2) ? (mode === 'external' ? 'top' : 'reps') : metric;
  const pts = effectiveMetric === 'e1rm' ? e1rmPoints : effectiveMetric === 'top' ? topPoints : repPoints;
  const evs = useMemo(() => recordEvents(completed, sets), [completed, sets]);
  const recs = useMemo(() => {
    const latest = new Map<string, (typeof evs)[number]>();
    for (const e of evs) latest.set(`${e.exerciseId}:${e.type}`, e);
    return [...latest.values()];
  }, [evs]);

  const weekStart = startOfWeek(Date.now()) + weekOffset * 7 * DAY;
  const split = useMemo(() => muscleSetsSplit(completed, sets, weekStart, weekStart + 7 * DAY), [completed, sets, weekStart]);
  const planned = useMemo(() => plannedWeeklySets(settings.schedule, templates, exMap), [settings.schedule, templates, exMap]);
  const maxBar = Math.max(VOLUME_BANDS.high + 4, ...MUSCLES.map((m) => split.direct[m] + split.indirect[m]));

  const freq = useMemo(() => {
    const vals: number[] = [], labels: string[] = [];
    const ws0 = startOfWeek(Date.now());
    for (let i = 11; i >= 0; i--) { const ws = ws0 - i * 7 * DAY; vals.push(completed.filter((s) => s.startedAt >= ws && s.startedAt < ws + 7 * DAY).length); labels.push(fmtDate(ws, { month: 'numeric', day: 'numeric' })); }
    return { vals, labels };
  }, [completed]);
  const totalWorking = sets.filter((s) => s.completed && s.kind === 'working').length;

  const bwPoints: Point[] = bodyweight.map((b) => ({ x: new Date(b.date + 'T12:00:00').getTime(), y: toDisplay(b.kg, unit) }));
  const addBw = async () => {
    const v = Number(bw.replace(',', '.'));
    if (!(v > 20 && v < 700 * (unit === 'lb' ? 2.2 : 1))) { toast('Enter a realistic body weight'); return; }
    await saveBodyWeight({ date: localDateStr(), kg: fromDisplay(v, unit) });
    setBw(''); toast('Body weight saved');
  };

  const metricOptions = mode === 'external'
    ? [{ value: 'e1rm' as Metric, label: 'Est. 1RM' }, { value: 'top' as Metric, label: 'Top weight' }, { value: 'reps' as Metric, label: 'Total reps' }]
    : [{ value: 'top' as Metric, label: mode === 'assisted' ? 'Assistance' : 'Added load' }, { value: 'reps' as Metric, label: 'Total reps' }];

  return (
    <div className="stack">
      <div><h1 className="page-title">Progress</h1><p className="page-sub">Charts use only the sets you have logged.</p></div>

      <div className="grid3">
        <div className="card stat"><span className="v num">{completed.length}</span><span className="l">workouts</span></div>
        <div className="card stat"><span className="v num">{totalWorking}</span><span className="l">working sets</span></div>
        <div className="card stat"><span className="v num">{completed.length ? (completed.length / Math.max(1, (Date.now() - Math.min(...completed.map((s) => s.startedAt))) / (7 * DAY))).toFixed(1) : '0'}</span><span className="l">per week</span></div>
      </div>

      <div className="card stack">
        <h2 className="section-title">Exercise performance</h2>
        {withData.length === 0 ? <Empty title="No data yet">Finish a workout and your exercise charts will appear here.</Empty> : (
          <>
            <select aria-label="Exercise" value={selected} onChange={(e) => setExId(e.target.value)}>{withData.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <Segmented label="Metric" value={effectiveMetric} options={metricOptions} onChange={setMetric} />
            {pts.length >= 2 ? (
              <LineChart points={pts} xFormat={(x) => fmtDate(x)} unitLabel={effectiveMetric === 'reps' ? 'reps' : unit} ariaLabel={`${def?.name ?? 'Exercise'} ${effectiveMetric} over time`} />
            ) : <p className="small muted">{pts.length === 1 ? 'One session logged. A trend needs at least two.' : 'Not enough data for this metric yet.'}</p>}
            {metric === 'e1rm' && effectiveMetric !== 'e1rm' && mode === 'external' && <p className="tiny muted">Estimated 1RM needs sets of 1–10 reps in at least two sessions.</p>}
            {effectiveMetric === 'e1rm' && <p className="tiny muted">Estimated 1RM is a rough calculation (Epley formula) from sets of 1–10 reps, not a tested max.</p>}
            <div className="hscroll-safe">
              <table className="t"><thead><tr><th>Date</th><th>Sets</th></tr></thead><tbody>
                {[...hist].reverse().slice(0, 6).map((h) => <tr key={h.sessionId}><td className="num">{fmtDate(h.startedAt)}</td><td className="num">{h.working.map((s) => `${fmtWeight(s.weightKg, unit)}×${s.reps}`).join('  ')}</td></tr>)}
              </tbody></table>
            </div>
          </>
        )}
      </div>

      <div className="card stack">
        <div className="row between"><h2 className="section-title">Weekly sets by muscle</h2>
          <div className="row" style={{ gap: 0 }}>
            <button className="icon-btn" aria-label="Previous week" onClick={() => setWeekOffset(weekOffset - 1)}><Icon name="back" size={18} /></button>
            <button className="icon-btn" aria-label="Next week" disabled={weekOffset >= 0} onClick={() => setWeekOffset(weekOffset + 1)}><Icon name="chevron" size={18} /></button>
          </div>
        </div>
        <p className="small muted">Week of {fmtDate(weekStart, { month: 'short', day: 'numeric' })}{weekOffset === 0 ? ' (so far)' : ''}. Lighter bar = indirect work counted at half a set. Line = your plan.</p>
        {completed.length === 0 ? <Empty title="No volume yet">Weekly sets per muscle appear after your first workout.</Empty> : (
          <div>
            {MUSCLES.filter((m) => split.direct[m] + split.indirect[m] > 0 || planned[m] > 0).map((m) => {
              const total = split.direct[m] + split.indirect[m];
              return (
                <div className="bar-row" key={m}>
                  <span>{muscleLabel(m)}</span>
                  <div className="bar-track" role="img" aria-label={`${muscleLabel(m)}: ${total} effective sets, ${volumeLabel(total)}`}>
                    <i className="ind" style={{ width: `${(total / maxBar) * 100}%` }} />
                    <i style={{ width: `${(split.direct[m] / maxBar) * 100}%` }} />
                    {planned[m] > 0 && <u style={{ left: `${(planned[m] / maxBar) * 100}%` }} />}
                  </div>
                  <span className="num muted" style={{ textAlign: 'right' }}>{Number.isInteger(total) ? total : total.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="tiny muted">Roughly {VOLUME_BANDS.low}–{VOLUME_BANDS.high} hard weekly sets per muscle suits most people. It is a guide, not a rule; recovery and performance matter more than any number.</p>
      </div>

      <div className="card stack">
        <h2 className="section-title">Training frequency</h2>
        {completed.length ? <ColumnChart values={freq.vals} labels={freq.labels} ariaLabel="Workouts per week, last 12 weeks" /> : <Empty title="No sessions yet" />}
      </div>

      <div className="card stack">
        <h2 className="section-title">Personal records</h2>
        {recs.length === 0 ? <Empty title="No records yet">Records are the best sets you have logged.</Empty> : (
          <div className="list">
            {recs.filter((r) => r.type !== 'setVolume').sort((a, b) => b.at - a.at).slice(0, 12).map((r) => (
              <div className="item" key={r.exerciseId + r.type}>
                <span style={{ color: 'var(--accent)' }}><Icon name="trophy" size={18} /></span>
                <div className="main"><div className="title ellip">{exMap.get(r.exerciseId)?.name ?? r.exerciseId}</div><div className="small muted">{prLabel(r, unit)} · {fmtDate(r.at)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title">Body weight</h2>
        <div className="row"><input type="text" inputMode="decimal" aria-label={`Body weight today in ${unit}`} placeholder={`Today (${unit})`} value={bw} onChange={(e) => setBw(e.target.value)} /><button className="btn primary" onClick={addBw}>Save</button></div>
        {bwPoints.length >= 2 ? <LineChart points={bwPoints} xFormat={(x) => fmtDate(x)} unitLabel={unit} ariaLabel="Body weight over time" /> : <p className="small muted">{bwPoints.length ? 'Add another entry on a different day to see a trend.' : 'No entries yet. Weigh in under similar conditions for the cleanest trend.'}</p>}
        {bodyweight.length > 0 && (
          <div className="list">{[...bodyweight].reverse().slice(0, 5).map((b) => (
            <div className="item" key={b.id}><div className="main"><span className="num">{fmtWeight(b.kg, unit, true)}</span> <span className="muted small">{fmtDate(new Date(b.date + 'T12:00:00').getTime(), { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              <button className="icon-btn" aria-label={`Delete entry for ${b.date}`} onClick={async () => { if (await confirm({ title: 'Delete this entry?', confirmLabel: 'Delete', danger: true })) await deleteBodyWeight(b.id); }}><Icon name="trash" size={18} /></button></div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
