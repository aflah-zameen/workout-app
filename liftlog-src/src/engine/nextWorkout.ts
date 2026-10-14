import type { Session, Settings, WorkoutTemplate } from '../types';
import { DAY, startOfDay, weekdayIndex } from '../lib/util';

export type NextWorkout =
  | { kind: 'resume'; session: Session }
  | { kind: 'today'; template: WorkoutTemplate }
  | { kind: 'done'; template: WorkoutTemplate; next?: { template: WorkoutTemplate; daysAhead: number } }
  | { kind: 'missed'; template: WorkoutTemplate; scheduledDaysAgo: number }
  | { kind: 'rest'; next?: { template: WorkoutTemplate; daysAhead: number } };

export function nextWorkout(
  settings: Pick<Settings, 'schedule'>, templates: WorkoutTemplate[], sessions: Session[], at: number,
): NextWorkout {
  const active = sessions.find((s) => s.status === 'active');
  if (active) return { kind: 'resume', session: active };

  const tMap = new Map(templates.map((t) => [t.id, t]));
  const today = weekdayIndex(at);
  const dayStart = startOfDay(at);
  const done = sessions.filter((s) => s.status === 'completed');
  const doneToday = (tid: string) => done.some((s) => s.templateId === tid && s.startedAt >= dayStart);

  const upcoming = () => {
    for (let i = 1; i <= 7; i++) {
      const tid = settings.schedule[(today + i) % 7];
      const t = tid ? tMap.get(tid) : null;
      if (t) return { template: t, daysAhead: i };
    }
    return undefined;
  };

  const tid = settings.schedule[today];
  const t = tid ? tMap.get(tid) : undefined;
  if (t) {
    return doneToday(t.id) ? { kind: 'done', template: t, next: upcoming() } : { kind: 'today', template: t };
  }

  // Rest day: did the user miss a scheduled session in the previous 3 days?
  for (let back = 1; back <= 3; back++) {
    const bid = settings.schedule[(today - back + 7) % 7];
    const bt = bid ? tMap.get(bid) : undefined;
    if (!bt) continue;
    const since = dayStart - back * DAY;
    const happened = done.some((s) => s.templateId === bt.id && s.startedAt >= since);
    if (!happened) return { kind: 'missed', template: bt, scheduledDaysAgo: back };
  }
  return { kind: 'rest', next: upcoming() };
}
