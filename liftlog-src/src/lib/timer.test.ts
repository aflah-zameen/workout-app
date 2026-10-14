import { describe, expect, it } from 'vitest';
import { adjustTimer, isFinished, pauseTimer, remainingSec, resumeTimer, startTimer } from './timer';

describe('rest timer', () => {
  const t0 = 1_000_000;
  it('counts down from elapsed wall-clock time, even after the app was suspended', () => {
    const t = startTimer(120, 'Squat', t0);
    expect(remainingSec(t, t0)).toBe(120);
    expect(remainingSec(t, t0 + 45_000)).toBe(75);
    // Phone locked for 10 minutes: timer is simply finished on return
    expect(remainingSec(t, t0 + 600_000)).toBe(0);
    expect(isFinished(t, t0 + 600_000)).toBe(true);
  });

  it('pauses and resumes without losing time', () => {
    let t = startTimer(90, 'Row', t0);
    t = pauseTimer(t, t0 + 30_000);
    expect(remainingSec(t, t0 + 500_000)).toBe(60); // frozen
    t = resumeTimer(t, t0 + 600_000);
    expect(remainingSec(t, t0 + 610_000)).toBe(50);
  });

  it('survives a serialise/restore cycle (reload recovery)', () => {
    const t = startTimer(180, 'Bench', t0);
    const restored = JSON.parse(JSON.stringify(t));
    expect(remainingSec(restored, t0 + 100_000)).toBe(80);
  });

  it('adjusts by ±15s and never goes negative', () => {
    let t = startTimer(60, 'x', t0);
    t = adjustTimer(t, 15, t0 + 10_000);
    expect(remainingSec(t, t0 + 10_000)).toBe(65);
    t = adjustTimer(t, -500, t0 + 10_000);
    expect(remainingSec(t, t0 + 10_000)).toBe(0);
  });
});
