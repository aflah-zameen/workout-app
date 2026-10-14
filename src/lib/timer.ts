import type { TimerState } from '../types';

/** Pure, elapsed-time based timer maths so it survives backgrounding and reloads. */
export function startTimer(durationSec: number, label: string, at: number): TimerState {
  return { id: 'timer', durationSec, startedAt: at, remainingAtStart: durationSec, running: true, label, updatedAt: at };
}

export function remainingSec(t: TimerState, at: number): number {
  if (!t.running) return Math.max(0, t.remainingAtStart);
  const elapsed = (at - t.startedAt) / 1000;
  return Math.max(0, t.remainingAtStart - elapsed);
}

export function pauseTimer(t: TimerState, at: number): TimerState {
  if (!t.running) return t;
  return { ...t, running: false, remainingAtStart: remainingSec(t, at), updatedAt: at };
}

export function resumeTimer(t: TimerState, at: number): TimerState {
  if (t.running || t.remainingAtStart <= 0) return t;
  return { ...t, running: true, startedAt: at, updatedAt: at };
}

export function adjustTimer(t: TimerState, deltaSec: number, at: number): TimerState {
  const rem = remainingSec(t, at);
  const next = Math.max(0, rem + deltaSec);
  return { ...t, startedAt: at, remainingAtStart: next, durationSec: Math.max(t.durationSec, next), updatedAt: at };
}

export const isFinished = (t: TimerState, at: number) => t.running && remainingSec(t, at) <= 0;

export const TIMER_PRESETS = [60, 90, 120, 150, 180];
