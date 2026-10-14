import { useMemo } from 'react';
import { useApp } from '../ctx';
import { Sheet } from '../components/ui';
import { sessionPRs } from '../engine/records';
import { buildExerciseHistory, compareSessions, topSet, volumeLoad } from '../engine/history';
import { fmtDuration } from '../lib/util';
import { fmtWeight } from '../lib/units';
import { prLabel } from './Home';
import { describeSets } from '../engine/progression';

export default function Summary({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { completed, sets, settings, exMap } = useApp();
  const s = completed.find((x) => x.id === sessionId);
  const data = useMemo(() => {
    if (!s) return null;
    const mine = sets.filter((x) => x.sessionId === sessionId && x.completed);
    const working = mine.filter((x) => x.kind === 'working');
    const prs = sessionPRs(sessionId, completed, sets);
    const highlights = s.exercises.map((ex) => {
      const hist = buildExerciseHistory(completed, sets, ex.exerciseId);
      const idx = hist.findIndex((h) => h.sessionId === sessionId);
      const cur = hist[idx]; const prev = hist[idx + 1];
      if (!cur) return null;
      const trend = prev ? compareSessions(prev.working, cur.working, ex.loadModeSnapshot) : null;
      return { ex, cur, trend, top: topSet(cur.working, ex.loadModeSnapshot) };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    return { working, warm: mine.length - working.length, prs, highlights, volume: volumeLoad(working) };
  }, [s, sets, completed, sessionId]);
  if (!s || !data) return null;
  const unit = settings.unit;
  return (
    <Sheet label="Workout summary" onClose={onClose}>
      <div className="stack">
        <div><span className="pill accent">Workout saved</span><h2 className="page-title" style={{ fontSize: 26, marginTop: 8 }}>{s.name}</h2></div>
        <div className="grid3">
          <div className="stat"><span className="v num">{fmtDuration(s.durationSec ?? 0)}</span><span className="l">duration</span></div>
          <div className="stat"><span className="v num">{data.working.length}</span><span className="l">working sets</span></div>
          <div className="stat"><span className="v num">{fmtWeight(data.volume, unit)}</span><span className="l">{unit} total volume</span></div>
        </div>
        {data.warm > 0 && <p className="tiny muted">{data.warm} warm-up set{data.warm === 1 ? '' : 's'} logged separately.</p>}

        <h3 className="section-title">Records</h3>
        {data.prs.length ? <div className="list">{data.prs.map((p, i) => <div className="item" key={i}><div className="main"><div className="title">{exMap.get(p.exerciseId)?.name ?? s.exercises.find((e) => e.exerciseId === p.exerciseId)?.nameSnapshot}</div><div className="small muted">{prLabel(p, unit)}</div></div></div>)}</div>
          : <p className="small muted">No new records this time. Your first logs of an exercise set the baseline.</p>}

        <h3 className="section-title">Performance</h3>
        <div className="list">
          {data.highlights.map((h) => (
            <div className="item" key={h.ex.uid}>
              <div className="main"><div className="title">{h.ex.nameSnapshot}</div><div className="small muted num">{describeSets(h.cur.working, unit, h.ex.loadModeSnapshot)}</div></div>
              <span className={'pill ' + (h.trend === 'up' ? 'accent' : h.trend === 'down' ? 'warn' : '')}>{h.trend === 'up' ? 'Improved' : h.trend === 'down' ? 'Lower' : h.trend === 'same' ? 'Matched' : 'Baseline'}</span>
            </div>
          ))}
        </div>
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
