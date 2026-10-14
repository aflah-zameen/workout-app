import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { clearTimer, saveTimer } from '../db/repo';
import { adjustTimer, pauseTimer, remainingSec, resumeTimer, startTimer, TIMER_PRESETS } from '../lib/timer';
import { fmtDuration } from '../lib/util';
import { Icon, Sheet, useInterval } from './ui';
import { useApp } from '../ctx';

let audio: AudioContext | null = null;
/** Must be called from a user gesture at least once so iOS lets us play the end-of-rest tone. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio = audio ?? new AC();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* audio is optional */ }
}

function beep(sound: boolean) {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported on iOS */ }
  if (!sound || !audio) return;
  const t0 = audio.currentTime;
  [0, 0.28, 0.56].forEach((d) => {
    const o = audio!.createOscillator(); const g = audio!.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audio!.destination);
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
    o.start(t0 + d); o.stop(t0 + d + 0.22);
  });
}

export function useRestTimer() {
  const { settings } = useApp();
  const timer = useLiveQuery(() => db.timer.get('timer'), []);
  const [, tick] = useState(0);
  const finishedFor = useRef<number>(0);

  useInterval(() => tick((n) => n + 1), timer?.running ? 250 : null);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    document.addEventListener('visibilitychange', f);
    window.addEventListener('focus', f);
    window.addEventListener('pageshow', f);
    return () => { document.removeEventListener('visibilitychange', f); window.removeEventListener('focus', f); window.removeEventListener('pageshow', f); };
  }, []);

  const now = Date.now();
  const remaining = timer ? remainingSec(timer, now) : 0;
  const finished = !!timer && timer.running && remaining <= 0;

  useEffect(() => {
    if (!timer || !finished || finishedFor.current === timer.updatedAt) return;
    finishedFor.current = timer.updatedAt;
    const overdue = (Date.now() - timer.startedAt) / 1000 - timer.remainingAtStart;
    if (overdue < 15) beep(settings.timerSound);
    void saveTimer({ ...timer, running: false, remainingAtStart: 0, updatedAt: Date.now() });
  });

  return {
    timer, remaining, done: !!timer && !timer.running && timer.remainingAtStart <= 0,
    start: (sec: number, label: string) => { unlockAudio(); return saveTimer(startTimer(sec, label, Date.now())); },
    pause: () => timer && saveTimer(pauseTimer(timer, Date.now())),
    resume: () => timer && saveTimer(resumeTimer(timer, Date.now())),
    adjust: (d: number) => timer && saveTimer(adjustTimer(timer, d, Date.now())),
    stop: () => clearTimer(),
  };
}

export type RestTimerApi = ReturnType<typeof useRestTimer>;

export function TimerBar({ api, onPick }: { api: RestTimerApi; onPick: () => void }) {
  const { timer, remaining, done } = api;
  if (!timer) {
    return <button className="btn small" onClick={onPick}><Icon name="timer" size={18} /> Rest timer</button>;
  }
  const pct = timer.durationSec > 0 ? Math.min(100, (remaining / timer.durationSec) * 100) : 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button className="timer-pill grow" onClick={onPick} aria-label="Rest timer options" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><Icon name="timer" size={18} /><span className="num" style={{ fontSize: 22 }} role="timer">{done ? 'Rest over' : fmtDuration(Math.ceil(remaining))}</span></span>
          <span className="tiny" style={{ opacity: 0.75 }}>{timer.label}</span>
        </button>
        <button className="icon-btn" aria-label="Subtract 15 seconds" onClick={() => api.adjust(-15)}><span style={{ fontWeight: 700, fontSize: 13 }}>−15</span></button>
        <button className="icon-btn" aria-label="Add 15 seconds" onClick={() => api.adjust(15)}><span style={{ fontWeight: 700, fontSize: 13 }}>+15</span></button>
        {!done && (timer.running
          ? <button className="icon-btn" aria-label="Pause timer" onClick={api.pause}><Icon name="pause" /></button>
          : <button className="icon-btn" aria-label="Resume timer" onClick={api.resume}><Icon name="play" /></button>)}
        <button className="icon-btn" aria-label="Skip rest" onClick={api.stop}><Icon name="x" /></button>
      </div>
      <div className="timer-bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>
    </div>
  );
}

export function TimerSheet({ api, defaultSec, label, onClose }: { api: RestTimerApi; defaultSec: number; label: string; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const go = (sec: number) => { void api.start(sec, label); onClose(); };
  return (
    <Sheet label="Rest timer" onClose={onClose}>
      <div className="stack">
        <h2 className="section-title">Rest timer</h2>
        <div className="chips">
          {TIMER_PRESETS.map((s) => (
            <button key={s} className="chip" aria-pressed={s === defaultSec} onClick={() => go(s)}>{s >= 60 ? `${s / 60 === Math.floor(s / 60) ? s / 60 : (s / 60).toFixed(1)} min` : `${s}s`}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="cust">Custom (seconds)</label>
          <div className="row">
            <input id="cust" type="number" inputMode="numeric" min={5} max={1800} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 105" />
            <button className="btn primary" disabled={!(Number(custom) >= 5)} onClick={() => go(Math.min(1800, Math.round(Number(custom))))}>Start</button>
          </div>
        </div>
        {api.timer && <button className="btn danger block" onClick={() => { void api.stop(); onClose(); }}>Cancel timer</button>}
        <p className="tiny muted">Timing uses the clock, so it stays correct if you switch apps or lock your phone. iPhone web apps can’t sound an alarm in the background; reopen Liftlog and the timer shows the time that has passed.</p>
      </div>
    </Sheet>
  );
}
