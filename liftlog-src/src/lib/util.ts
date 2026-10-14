export const uid = (): string =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const DAY = 86_400_000;
export const now = () => Date.now();

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday=0 … Sunday=6 */
export const weekdayIndex = (d: Date | number): number => (new Date(d).getDay() + 6) % 7;

export function startOfDay(t: number | Date): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the Monday-based week containing t. */
export function startOfWeek(t: number | Date): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - weekdayIndex(d));
  return d.getTime();
}

export function localDateStr(t: number | Date = Date.now()): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtDate(t: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Date(t).toLocaleDateString(undefined, opts);
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export function relativeDay(t: number, ref = Date.now()): string {
  const diff = Math.round((startOfDay(ref) - startOfDay(t)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return fmtDate(t);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

export function muscleLabel(m: string): string {
  return m.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
