import { useEffect, useRef, useState, type ReactNode } from 'react';

const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  x: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  timer: 'M12 8v5l3 2M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  play: 'M7 4v16l13-8z',
  pause: 'M8 5v14M16 5v14',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  info: 'M12 8v.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
};

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function Sheet({ children, onClose, center, label }: { children: ReactNode; onClose: () => void; center?: boolean; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'sheet' + (center ? ' center' : '')} role="dialog" aria-modal="true" aria-label={label}>
        {!center && <div className="grab" />}
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/** Number input that keeps a free-text draft while typing and commits valid numbers immediately. */
export function NumInput({ value, onChange, placeholder, step, label, min = 0, max, decimals = true }: {
  value: number | null; onChange: (v: number | null) => void; placeholder?: string; step: number; label: string; min?: number; max?: number; decimals?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? '' : String(value));
  const commit = (v: number | null) => {
    if (v == null) return onChange(null);
    let n = Math.max(min, v);
    if (max != null) n = Math.min(max, n);
    onChange(Math.round(n * 100) / 100);
  };
  const base = value ?? (placeholder && !Number.isNaN(Number(placeholder)) ? Number(placeholder) : 0);
  return (
    <div className="step">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => { setDraft(null); commit(Math.max(min, base - step)); }}>−</button>
      <input
        aria-label={label} inputMode={decimals ? 'decimal' : 'numeric'} enterKeyHint="done" placeholder={placeholder}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.');
          if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
          setDraft(raw);
          if (raw === '' || raw === '.') return commit(null);
          commit(Number(raw));
        }}
        onBlur={() => setDraft(null)}
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => { setDraft(null); commit(base + step); }}>+</button>
    </div>
  );
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
