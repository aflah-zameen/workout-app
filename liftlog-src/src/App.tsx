import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppProvider, useApp, type Tab } from './ctx';
import { ensureSeeded } from './db/repo';
import { buildSettings } from './data/seed';
import { Icon } from './components/ui';
import Home from './screens/Home';
import Workout from './screens/Workout';
import Progress from './screens/Progress';
import History from './screens/History';
import Settings from './screens/Settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'workout', label: 'Workout', icon: 'dumbbell' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

class Boundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="screen"><div className="card stack"><h1 className="section-title">Something went wrong</h1>
        <p className="small muted">{this.state.err.message}. Your saved workouts are untouched in this device’s storage.</p>
        <button className="btn primary" onClick={() => location.reload()}>Reload Liftlog</button></div></div>
    );
  }
}

function InstallHint() {
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('liftlog-install-hint') === '1'; } catch { return false; } });
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (hide || standalone || !ios) return null;
  return (
    <div className="card accent row" style={{ margin: '0 0 14px' }}>
      <span className="small grow">Install Liftlog: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
      <button className="icon-btn" aria-label="Dismiss install tip" onClick={() => { try { localStorage.setItem('liftlog-install-hint', '1'); } catch { /* ignore */ } setHide(true); }}><Icon name="x" size={18} /></button>
    </div>
  );
}

function Shell() {
  const app = useApp();
  const { tab, go, active, ready } = app;
  const resumed = useRef(false);
  // Reopening the app with an unfinished workout lands straight on it.
  useEffect(() => {
    if (ready && !resumed.current) { resumed.current = true; if (active) go('workout'); }
  }, [ready, active, go]);
  if (!ready) return <div className="screen"><p className="muted">Loading…</p></div>;
  return (
    <div className="app">
      <main className="screen" id="main">
        {tab === 'home' && <><InstallHint /><Home /></>}
        {tab === 'workout' && <Workout />}
        {tab === 'progress' && <Progress />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
              {t.id === 'workout' && active && <i className="dot" aria-label="Workout in progress" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    ensureSeeded().then(() => setState('ok')).catch((e: Error) => { setError(e.message); setState('error'); });
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  if (state === 'error') {
    return <div className="screen"><div className="card stack"><h1 className="section-title">Storage unavailable</h1>
      <p className="small muted">Liftlog couldn’t open its on-device database ({error}). Private browsing and some restricted modes block IndexedDB. Open Liftlog in normal Safari, or from the Home Screen icon.</p></div></div>;
  }
  if (state === 'loading') return <div className="screen"><p className="muted">Loading…</p></div>;
  return <Boundary><AppProvider defaults={buildSettings(0)}>{() => <Shell />}</AppProvider></Boundary>;
}
