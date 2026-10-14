import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import type { BodyWeightEntry, ExerciseDef, Session, SetEntry, Settings, WorkoutTemplate } from './types';
import { Sheet } from './components/ui';

export type Tab = 'home' | 'workout' | 'progress' | 'history' | 'settings';

interface ConfirmOpts { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; cancelLabel?: string }
export interface AppCtx {
  ready: boolean;
  settings: Settings;
  exercises: ExerciseDef[];
  exMap: Map<string, ExerciseDef>;
  templates: WorkoutTemplate[];
  sessions: Session[];
  completed: Session[];
  active?: Session;
  sets: SetEntry[];
  bodyweight: BodyWeightEntry[];
  tab: Tab;
  go: (t: Tab, opts?: { openTemplate?: string; openSession?: string; exerciseId?: string }) => void;
  intent: { openTemplate?: string; openSession?: string; exerciseId?: string };
  clearIntent: () => void;
  toast: (msg: string) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

export function AppProvider({ children, defaults }: { children: (ctx: AppCtx) => ReactNode; defaults: Settings }) {
  const settingsQ = useLiveQuery(() => db.settings.get('settings'), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
  // Sets of completed sessions only. Writes to the active session never invalidate this query,
  // so logging a set stays fast even with years of history.
  const sets = useLiveQuery(async () => {
    const ids = await db.sessions.where('status').equals('completed').primaryKeys();
    return db.sets.where('sessionId').anyOf(ids).toArray();
  }, []);
  const bodyweight = useLiveQuery(() => db.bodyweight.orderBy('date').toArray(), []);

  const [tab, setTab] = useState<Tab>('home');
  const [intent, setIntent] = useState<AppCtx['intent']>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const toastTimer = useRef<number>(0);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);
  const go = useCallback<AppCtx['go']>((t, opts) => { setIntent(opts ?? {}); setTab(t); }, []);
  const clearIntent = useCallback(() => setIntent({}), []);

  const settings = settingsQ ?? defaults;
  const ready = !!(settingsQ && exercises && templates && sessions && sets && bodyweight);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : settings.theme === 'dark';
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0c' : '#f4f4f1');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [settings.theme]);

  const value = useMemo<AppCtx>(() => {
    const ex = exercises ?? [];
    const ss = sessions ?? [];
    return {
      ready, settings, exercises: ex, exMap: new Map(ex.map((e) => [e.id, e])), templates: templates ?? [], sessions: ss,
      completed: ss.filter((s) => s.status === 'completed'), active: ss.find((s) => s.status === 'active'),
      sets: sets ?? [], bodyweight: bodyweight ?? [], tab, go, intent, clearIntent, toast, confirm,
    };
  }, [ready, settings, exercises, templates, sessions, sets, bodyweight, tab, go, intent, clearIntent, toast, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children(value)}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      {dialog && (
        <Sheet center label={dialog.title} onClose={() => { dialog.resolve(false); setDialog(null); }}>
          <div className="stack">
            <h2 className="section-title">{dialog.title}</h2>
            {dialog.body && <div className="small muted" style={{ lineHeight: 1.5 }}>{dialog.body}</div>}
            <div className="row">
              <button className="btn grow" onClick={() => { dialog.resolve(false); setDialog(null); }}>{dialog.cancelLabel ?? 'Cancel'}</button>
              <button className={'btn grow ' + (dialog.danger ? 'danger' : 'primary')} onClick={() => { dialog.resolve(true); setDialog(null); }}>{dialog.confirmLabel ?? 'Confirm'}</button>
            </div>
          </div>
        </Sheet>
      )}
    </Ctx.Provider>
  );
}
