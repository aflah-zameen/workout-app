import { useState } from 'react';
import { Sheet } from './ui';
import type { Feedback } from '../types';

const FIELDS: { key: 'sleep' | 'energy' | 'soreness' | 'recovery'; label: string; hint: string }[] = [
  { key: 'sleep', label: 'Sleep quality', hint: '1 poor · 5 great' },
  { key: 'energy', label: 'Energy', hint: '1 drained · 5 energised' },
  { key: 'soreness', label: 'Soreness', hint: '1 none · 5 very sore' },
  { key: 'recovery', label: 'Feeling recovered', hint: '1 not at all · 5 fully' },
];

export function CheckInSheet({ title, onStart, onClose }: {
  title: string; onStart: (opts: { feedback?: Feedback; deload?: boolean }) => void; onClose: () => void;
}) {
  const [fb, setFb] = useState<Partial<Record<(typeof FIELDS)[number]['key'], number>>>({});
  const [deload, setDeload] = useState(false);
  const any = Object.keys(fb).length > 0;
  return (
    <Sheet label="Quick check-in" onClose={onClose}>
      <div className="stack">
        <div>
          <h2 className="section-title">Quick check-in</h2>
          <p className="small muted">Optional. Your answers help Liftlog judge recovery. Skip any or all.</p>
        </div>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <div className="row between"><span className="label">{f.label}</span><span className="tiny muted">{f.hint}</span></div>
            <div className="rating" role="group" aria-label={f.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-pressed={fb[f.key] === n} onClick={() => setFb({ ...fb, [f.key]: fb[f.key] === n ? undefined : n })}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={deload} onChange={(e) => setDeload(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          <span className="small">Mark as a deload session (lighter week)</span>
        </label>
        <button className="btn primary block" onClick={() => onStart({ feedback: any ? { ...fb, at: Date.now() } : undefined, deload })}>Start {title}</button>
        <button className="btn ghost block" onClick={() => onStart({ deload })}>Skip check-in</button>
      </div>
    </Sheet>
  );
}
