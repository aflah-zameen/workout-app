import { describe, expect, it } from 'vitest';
import { canon, fmtWeight, fromDisplay, incrementFor, kgToLb, lbToKg, snapKg, toDisplay } from './units';

describe('unit conversion', () => {
  it('converts kg↔lb with the exact factor', () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 6);
    expect(kgToLb(100)).toBeCloseTo(220.462262, 5);
  });

  it('round-trips every 0.5 lb from 0.5 to 1000 lb without drift', () => {
    for (let lb = 0.5; lb <= 1000; lb += 0.5) {
      const kg = fromDisplay(lb, 'lb');
      expect(toDisplay(kg, 'lb')).toBe(lb);
    }
  });

  it('round-trips every 0.25 kg from 0.25 to 500 kg', () => {
    for (let kg = 0.25; kg <= 500; kg += 0.25) {
      expect(toDisplay(canon(kg), 'kg')).toBe(kg);
      // switching units there and back must not change the stored value
      const asLb = toDisplay(kg, 'lb');
      expect(Math.abs(fromDisplay(asLb, 'lb') - kg)).toBeLessThan(0.005);
    }
  });

  it('does not rewrite stored history when the display unit flips repeatedly', () => {
    const stored = fromDisplay(135, 'lb'); // user logged 135 lb
    let shown = '';
    for (let i = 0; i < 20; i++) {
      shown = fmtWeight(stored, i % 2 ? 'kg' : 'lb');
    }
    expect(fmtWeight(stored, 'lb')).toBe('135');
    expect(stored).toBe(fromDisplay(135, 'lb'));
    expect(shown).toBeTruthy();
  });

  it('formats weights and handles missing values', () => {
    expect(fmtWeight(null, 'kg')).toBe('–');
    expect(fmtWeight(62.5, 'kg', true)).toBe('62.5 kg');
    expect(fmtWeight(100, 'lb')).toBe('220.5');
  });

  it('uses practical increments in lb and snaps suggestions to loadable values', () => {
    expect(incrementFor(2.5, 'kg')).toBe(2.5);
    expect(incrementFor(2.5, 'lb')).toBe(5);
    expect(incrementFor(1, 'lb')).toBe(2.5);
    const snapped = snapKg(fromDisplay(137, 'lb'), 'lb', 2.5);
    expect(toDisplay(snapped, 'lb') % 5).toBe(0);
  });
});
