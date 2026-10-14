import { useApp } from '../ctx';
import { updateSettings } from '../db/repo';
import { WEEKDAYS_LONG } from '../lib/util';

export function ScheduleEditor() {
  const { settings, templates } = useApp();
  const change = (i: number, id: string) => {
    const next = [...settings.schedule];
    next[i] = id || null;
    void updateSettings({ schedule: next });
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {WEEKDAYS_LONG.map((d, i) => (
        <div className="row" key={d}>
          <label htmlFor={`day-${i}`} style={{ width: 96, fontWeight: 600 }}>{d}</label>
          <select id={`day-${i}`} value={settings.schedule[i] ?? ''} onChange={(e) => change(i, e.target.value)}>
            <option value="">Rest day</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ))}
      <p className="tiny muted">Rearranging days never changes your logged history. Aim for at least two rest days a week.</p>
    </div>
  );
}
