import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, tuned } from '../heat/config';
import { pointsFor, type DayPosition, type Scorable } from '../heat/engine';
import { TEST_CONFIG as config } from '../heat/testConfig';
import { heatColor, SURGE_PEAK, temperatureOf } from './temperature';

const plain: Scorable = { areaId: 'work', friction: 0, warmth: 0 };

function oklch(color: string): { lightness: number; chroma: number; hue: number } {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (!match) throw new Error(`Not an OKLCH colour: ${color}`);
  return { lightness: Number(match[1]), chroma: Number(match[2]), hue: Number(match[3]) };
}

/** The gradient sampled every hundredth of a full gauge, cold to the Surge peak. */
const samples = Array.from({ length: 121 }, (_, index) => oklch(heatColor(index / 100)));

describe('heatColor', () => {
  it('starts as cold blue-grey', () => {
    const cold = oklch(heatColor(0));
    expect(cold.chroma).toBeLessThan(0.03);
    expect(cold.hue).toBeGreaterThan(220);
    expect(cold.hue).toBeLessThan(270);
  });

  it('never passes through violet or pink: a colour is either nearly grey or red to yellow', () => {
    for (const sample of samples) {
      if (sample.chroma <= 0.025) continue;
      expect(sample.hue).toBeGreaterThanOrEqual(20);
      expect(sample.hue).toBeLessThanOrEqual(110);
    }
  });

  it('only gets lighter once it starts to glow, and is yellow at a full gauge', () => {
    for (let index = 35; index < samples.length; index++) {
      expect(samples[index]!.lightness).toBeGreaterThanOrEqual(samples[index - 1]!.lightness);
    }
    expect(oklch(heatColor(1)).hue).toBeGreaterThan(85);
  });

  it('pales towards white beyond a full gauge', () => {
    const full = oklch(heatColor(1));
    const peak = oklch(heatColor(SURGE_PEAK));
    expect(peak.lightness).toBeGreaterThan(full.lightness);
    expect(peak.chroma).toBeLessThan(full.chroma);
  });

  it('holds its ends outside the scale', () => {
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(5)).toBe(heatColor(SURGE_PEAK));
  });
});
const fresh: DayPosition = { inArea: 0 };
const deep: DayPosition = { inArea: 3 };

function temperature(item: Scorable, position: DayPosition): number {
  return temperatureOf(pointsFor(item, position, config), config);
}

describe('temperatureOf', () => {
  it('reaches the Surge peak for the most any item can earn, and never passes it', () => {
    // A fully warm routine with five stars, first in its area: 10 x 2 x 2 x 2.
    expect(temperatureOf(80, config)).toBeCloseTo(SURGE_PEAK, 10);
    expect(temperatureOf(500, config)).toBe(SURGE_PEAK);
    expect(temperatureOf(0, config)).toBe(0);
  });

  it('puts an everyday task in the warm middle of the gradient, not the cold end', () => {
    const plainFirst = temperature(plain, fresh);
    expect(plainFirst).toBeGreaterThan(0.5);
    expect(plainFirst).toBeLessThan(0.8);
  });

  it('shows Friction or warmth by the same step wherever the item falls in its area', () => {
    for (const item of [{ ...plain, friction: 1 }, { ...plain, friction: 5 }, { ...plain, warmth: 1 }]) {
      const atStart = temperature(item, fresh) / temperature(plain, fresh);
      const deepIn = temperature(item, deep) / temperature(plain, deep);
      expect(atStart).toBeGreaterThan(1);
      expect(deepIn).toBeCloseTo(atStart, 10);
    }
  });

  it('does not change with Effort', () => {
    for (const effort of ['easier', 'harder'] as const) {
      expect(temperatureOf(20, tuned(config, { ...STANDARD_TUNING, effort }))).toBe(temperatureOf(20, config));
    }
  });
});
