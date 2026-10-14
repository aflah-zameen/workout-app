import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import App from './App';
import { db, replaceDb } from './db/db';

configure({ asyncUtilTimeout: 6000 });
let n = 0;
beforeEach(() => {
  replaceDb(`ui-test-${++n}`);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-02T09:00:00')); // Monday → Pull A
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const user = () => userEvent.setup({ advanceTimers: () => {} });

describe('Liftlog UI flows (jsdom)', () => {
  it('shows today’s scheduled workout, honest empty states and the bottom navigation', async () => {
    render(<App />);
    expect((await screen.findAllByText('Pull A')).length).toBeGreaterThan(0);
    expect(screen.getByText('Back width, biceps, rear delts')).toBeTruthy();
    expect(screen.getByText(/Recommendations start after your first workout/)).toBeTruthy();
    expect(screen.getByText('No records yet')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Workout', 'Progress', 'History', 'Settings']) expect(within(nav).getByText(label)).toBeTruthy();
  });

  it('logs a set, survives an app restart mid-workout, then finishes and appears in History', async () => {
    const u = user();
    const first = render(<App />);
    await u.click(await screen.findByRole('button', { name: /Start workout/ }));
    await u.click(await screen.findByRole('button', { name: 'Skip check-in' }));

    const card = await screen.findByRole('region', { name: 'Pull-up' });
    await u.type(within(card).getByRole('textbox', { name: 'Set 1 reps' }), '8');
    await u.click(within(card).getByRole('button', { name: 'Log set 1' }));

    await waitFor(async () => {
      const saved = (await db.sets.toArray()).filter((s) => s.completed);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ reps: 8, kind: 'working' });
    });

    // "Restart": throw away the React tree and open the same IndexedDB again.
    first.unmount();
    const name = db.name; db.close(); replaceDb(name);
    render(<App />);
    const again = await screen.findByRole('region', { name: 'Pull-up' });
    expect(within(again).getByRole('button', { name: /Set 1 logged/ })).toBeTruthy();
    expect((within(again).getByRole('textbox', { name: 'Set 1 reps' }) as HTMLInputElement).value).toBe('8');

    // Finish
    await u.click(screen.getByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' });
    expect(within(dialog).getByText(/1 sets logged\. 16 planned sets were not completed/)).toBeTruthy();
    await u.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Workout saved')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Done' }));

    await u.click(within(screen.getByRole('navigation', { name: 'Main' })).getByText('History'));
    expect(await screen.findByText(/1 workout logged/)).toBeTruthy();
    const items = await screen.findAllByText(/Pull A/);
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows the previous session beside each exercise and a progression suggestion from real data', async () => {
    const u = user();
    // Seed a finished Pull A where every pulldown set hit 12 reps at 50 kg.
    const repo = await import('./db/repo');
    await repo.ensureSeeded();
    const s = await repo.startSession('tpl_pull_a');
    const rows = await db.sets.where('sessionId').equals(s.id).toArray();
    const pd = s.exercises.find((e) => e.exerciseId === 'lat_pulldown')!;
    for (const r of rows.filter((x) => x.exerciseUid === pd.uid)) await repo.saveSet({ ...r, weightKg: 50, reps: 12, rir: 2, completed: true, completedAt: Date.now() });
    await repo.finishSession(s.id);
    vi.setSystemTime(new Date('2026-03-05T09:00:00')); // Thursday (legs); start Pull A manually
    render(<App />);
    expect(await screen.findByText(/Consider increasing Lat pulldown/)).toBeTruthy();
    await u.click(within(screen.getByRole('navigation', { name: 'Main' })).getByText('Workout'));
    await u.click((await screen.findAllByRole('button', { name: /Start Pull A/ }))[0]);
    await u.click(await screen.findByRole('button', { name: 'Skip check-in' }));
    const card = await screen.findByRole('region', { name: /Lat pulldown/ });
    expect(within(card).getByText(/Last time/)).toBeTruthy();
    expect(within(card).getByText(/50×12, 50×12, 50×12/)).toBeTruthy();
    expect(within(card).getByText(/Increase to 52.5 kg/)).toBeTruthy();
    // The planned weight is NOT changed automatically.
    const weights = within(card).getAllByRole('textbox', { name: /weight/ }) as HTMLInputElement[];
    expect(weights.map((w) => w.value)).toEqual(['50', '50', '50']);
    await u.click(within(card).getByRole('button', { name: /Use 52.5 kg/ }));
    await waitFor(() => expect((within(card).getAllByRole('textbox', { name: /weight/ }) as HTMLInputElement[]).map((w) => w.value)).toEqual(['52.5', '52.5', '52.5']));
  });

  it('switching units re-displays history without changing stored kilograms', async () => {
    const u = user();
    const repo = await import('./db/repo');
    await repo.ensureSeeded();
    const s = await repo.startSession('tpl_push_a');
    const rows = await db.sets.where('sessionId').equals(s.id).toArray();
    await repo.saveSet({ ...rows[0], weightKg: 60, reps: 8, completed: true, completedAt: Date.now() });
    await repo.finishSession(s.id);
    render(<App />);
    await screen.findAllByText('Pull A');
    await u.click(within(screen.getByRole('navigation', { name: 'Main' })).getByText('Settings'));
    await u.click(await screen.findByRole('button', { name: 'lb' }));
    await waitFor(async () => expect((await repo.getSettings()).unit).toBe('lb'));
    expect((await db.sets.toArray()).find((x) => x.completed)?.weightKg).toBe(60);
  });
});

describe('static layout audit', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  it('declares no fixed pixel widths that could overflow a 393px-wide iPhone', () => {
    const bad = [...css.matchAll(/(^|[;{\s])(?:min-)?width:\s*(\d+)px/gm)].filter((m) => Number(m[2]) > 340);
    expect(bad.map((m) => m[0])).toEqual([]);
  });
  it('uses safe-area insets and viewport-fit=cover', () => {
    expect(css).toMatch(/safe-area-inset-top/);
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(readFileSync('index.html', 'utf8')).toMatch(/viewport-fit=cover/);
  });
  it('prevents horizontal scrolling at the document level', () => {
    expect(css).toMatch(/body \{[^}]*overflow-x: hidden/);
  });
});
