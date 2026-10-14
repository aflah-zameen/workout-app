import { useState } from 'react';
import type { Recommendation } from '../engine/recommend';
import { Icon } from './ui';
import { useApp } from '../ctx';
import { updateSettings } from '../db/repo';
import { fmtWeight } from '../lib/units';

const CONF: Record<string, string> = { insufficient: 'Not enough data', low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' };

export function InsightCard({ rec }: { rec: Recommendation }) {
  const { settings, toast, exMap } = useApp();
  const [open, setOpen] = useState(false);
  const approved = rec.action ? settings.planned?.[rec.action.exerciseId] === rec.action.weightKg : false;

  const dismiss = () => updateSettings({ dismissed: { ...settings.dismissed, [rec.key]: Date.now() } });
  const apply = async () => {
    if (!rec.action) return;
    await updateSettings({ planned: { ...(settings.planned ?? {}), [rec.action.exerciseId]: rec.action.weightKg } });
    toast(`Next session starts at ${fmtWeight(rec.action.weightKg, settings.unit, true)}`);
  };
  const tone = rec.tone === 'caution' ? 'warn' : rec.tone === 'positive' ? 'good' : '';

  return (
    <div className={`card insight ${tone}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span style={{ color: rec.tone === 'caution' ? 'var(--warn)' : 'var(--accent)', marginTop: 1 }}>
          <Icon name={rec.tone === 'caution' ? 'info' : rec.kind === 'progression' ? 'up' : 'bolt'} size={20} />
        </span>
        <div className="grow"><div style={{ fontWeight: 650, lineHeight: 1.3 }}>{rec.title}</div></div>
      </div>
      <div className="row wrap">
        <span className={'pill ' + (rec.confidence === 'high' ? 'accent' : '')}>{CONF[rec.confidence]}</span>
        <button className="small muted" style={{ textDecoration: 'underline', minHeight: 32 }} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide data' : 'Why?'}
        </button>
      </div>
      {open && <ul className="why">{rec.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      <div className="row">
        {rec.action && (
          <button className="btn small primary" disabled={approved} onClick={apply}>
            {approved ? 'Approved for next session' : `Use ${fmtWeight(rec.action.weightKg, settings.unit, true)} next time`}
          </button>
        )}
        {rec.exerciseId && !rec.action && exMap.get(rec.exerciseId) && <span className="tiny muted">Nothing changes automatically.</span>}
        <button className="btn small ghost" onClick={dismiss}>Dismiss</button>
      </div>
    </div>
  );
}
