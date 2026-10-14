import { useMemo } from 'react';

export interface Point { x: number; y: number; label?: string }

/** Keep at most `max` points, always keeping first and last, preferring local extremes. */
export function downsample(points: Point[], max = 120): Point[] {
  if (points.length <= max) return points;
  const out: Point[] = [points[0]];
  const bucket = (points.length - 2) / (max - 2);
  for (let i = 0; i < max - 2; i++) {
    const a = Math.floor(i * bucket) + 1, b = Math.min(points.length - 1, Math.floor((i + 1) * bucket) + 1);
    let best = points[a];
    let bestDev = -1;
    const mean = points.slice(a, b).reduce((s, p) => s + p.y, 0) / Math.max(1, b - a);
    for (let j = a; j < b; j++) { const d = Math.abs(points[j].y - mean); if (d > bestDev) { bestDev = d; best = points[j]; } }
    out.push(best);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function niceRange(min: number, max: number): [number, number] {
  if (min === max) { const pad = Math.max(1, Math.abs(min) * 0.1); return [min - pad, max + pad]; }
  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad) === 0 && min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad];
}

export function LineChart({ points, unitLabel, height = 170, format = (n: number) => String(Math.round(n * 10) / 10), xFormat, ariaLabel }: {
  points: Point[]; unitLabel?: string; height?: number; format?: (n: number) => string; xFormat: (x: number) => string; ariaLabel: string;
}) {
  const data = useMemo(() => downsample(points), [points]);
  if (data.length === 0) return null;
  const W = 340, H = height, L = 34, R = 10, T = 12, B = 22;
  const xs = data.map((p) => p.x), ys = data.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys));
  const sx = (x: number) => (x1 === x0 ? (L + W - R) / 2 : L + ((x - x0) / (x1 - x0)) * (W - L - R));
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={L - 6} y={sy(t) + 3} textAnchor="end">{format(t)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.length <= 40 && data.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === data.length - 1 ? 4.5 : 3} fill={i === data.length - 1 ? 'var(--accent)' : 'var(--bg)'} stroke="var(--accent)" strokeWidth="2" />)}
      {data.length > 40 && <circle cx={sx(data[data.length - 1].x)} cy={sy(data[data.length - 1].y)} r="4.5" fill="var(--accent)" />}
      <text x={L} y={H - 6} textAnchor="start">{xFormat(x0)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{xFormat(x1)}</text>
      {unitLabel && <text x={L} y={8} textAnchor="start">{unitLabel}</text>}
    </svg>
  );
}

export function ColumnChart({ values, labels, height = 120, ariaLabel }: { values: number[]; labels: string[]; height?: number; ariaLabel: string }) {
  const W = 340, H = height, L = 6, R = 6, T = 14, B = 20;
  const max = Math.max(1, ...values);
  const bw = (W - L - R) / values.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {values.map((v, i) => {
        const h = (v / max) * (H - T - B);
        return (
          <g key={i}>
            <rect x={L + i * bw + bw * 0.18} y={H - B - h} width={bw * 0.64} height={Math.max(v > 0 ? 2 : 0, h)} rx="3" fill={v > 0 ? 'var(--accent)' : 'var(--line)'} />
            {v > 0 && <text x={L + i * bw + bw / 2} y={H - B - h - 3} textAnchor="middle">{v}</text>}
            {(values.length <= 8 || i % 2 === 0 || i === values.length - 1) && <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
