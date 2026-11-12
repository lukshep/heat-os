import { describe, expect, it } from 'vitest';
import { MAX_HEAT } from './config';
import { DAY_MS, HOUR_MS } from './day';
import {
  afterCompleting,
  applyGain,
  areaFactor,
  cool,
  foldHeat,
  gainFor,
  pointsFor,
  quality,
  traceHeat,
  type CompletionFact,
  type DayPosition,
  type HeatState,
  type Scorable,
} from './engine';
import { TEST_CONFIG as config } from './testConfig';

const DAY_1 = '2026-01-05';
const DAY_2 = '2026-01-06';
const T0 = Date.UTC(2026, 0, 5, 12);

/** HEAT after one 20-point completion from cold: 100 * (1 - e^-0.2). */
const FIRST_TASK = 18.127;

const plain: Scorable = { areaId: 'work', important: false, avoided: false, warmth: 0 };
const start: DayPosition = { inArea: 0, areasOpened: 0, flagged: 0 };

let sequence = 0;
function fact(overrides: Partial<CompletionFact> = {}): CompletionFact {
  sequence += 1;
  return {
    ...plain,
    id: `c${String(sequence).padStart(4, '0')}`,
    at: T0,
    dayKey: DAY_1,
    itemId: `item-${sequence}`,
    kind: 'task',
    ...overrides,
  };
}

function pointsOf(log: CompletionFact[]): number[] {
  const last = Math.max(...log.map((entry) => entry.at));
  return traceHeat(log, config, [last]).scored.map((entry) => Math.round(entry.points * 1000) / 1000);
}

const empty: HeatState = { heat: 0, now: T0, today: DAY_1, areaCounts: {}, flaggedToday: 0 };

describe('cool', () => {
  it('loses 20% in 24 hours', () => {
    expect(cool(100, DAY_MS, config)).toBeCloseTo(80, 10);
    expect(cool(50, 2 * DAY_MS, config)).toBeCloseTo(32, 10);
  });

  it('is continuous: cooling in two steps equals cooling in one', () => {
    const twoSteps = cool(cool(90, 7 * HOUR_MS, config), 11 * HOUR_MS, config);
    expect(twoSteps).toBeCloseTo(cool(90, 18 * HOUR_MS, config), 10);
  });

  it('leaves HEAT alone when no time has passed', () => {
    expect(cool(73, 0, config)).toBe(73);
    expect(cool(73, -5000, config)).toBe(73);
  });
});

describe('areaFactor', () => {
  it('gives the first completion in an area a bonus', () => {
    expect(areaFactor('work', start, config)).toBe(2);
  });

  it('makes each further completion in the area worth a share of the one before', () => {
    expect(areaFactor('work', { ...start, inArea: 1 }, config)).toBe(0.5);
    expect(areaFactor('work', { ...start, inArea: 2 }, config)).toBe(0.25);
    expect(areaFactor('work', { ...start, inArea: 3 }, config)).toBe(0.125);
  });

  it('shrinks the bonus with every area already opened today', () => {
    expect(areaFactor('work', { ...start, areasOpened: 1 }, config)).toBe(1.5);
    expect(areaFactor('work', { ...start, areasOpened: 2 }, config)).toBe(1.25);
    expect(areaFactor('work', { ...start, areasOpened: 20 }, config)).toBeCloseTo(1, 5);
  });

  it('always rates a first task in a new area above a repeat', () => {
    const repeat = areaFactor('work', { ...start, inArea: 1 }, config);
    expect(areaFactor('home', { ...start, areasOpened: 50 }, config)).toBeGreaterThan(repeat);
  });

  it('gives items with no area no bonus', () => {
    expect(areaFactor(null, start, config)).toBe(1);
    expect(areaFactor(null, { ...start, inArea: 1 }, config)).toBe(0.5);
  });
});

describe('quality', () => {
  it('adds flag and warmth bonuses rather than compounding them', () => {
    expect(quality(plain, start, config)).toBe(1);
    expect(quality({ ...plain, important: true }, start, config)).toBe(1.5);
    expect(quality({ ...plain, important: true, avoided: true }, start, config)).toBe(2);
    expect(quality({ ...plain, warmth: 1 }, start, config)).toBe(2);
    expect(quality({ ...plain, important: true, avoided: true, warmth: 1 }, start, config)).toBe(3);
  });

  it('halves the flag bonus for each flagged completion already logged today', () => {
    const flagged: Scorable = { ...plain, important: true, avoided: true };
    expect(quality(flagged, { ...start, flagged: 1 }, config)).toBe(1.5);
    expect(quality(flagged, { ...start, flagged: 2 }, config)).toBe(1.25);
    expect(quality({ ...plain, important: true }, { ...start, flagged: 1 }, config)).toBe(1.25);
  });

  it('leaves unflagged items and warmth untouched by earlier flags', () => {
    expect(quality(plain, { ...start, flagged: 5 }, config)).toBe(1);
    expect(quality({ ...plain, warmth: 1 }, { ...start, flagged: 5 }, config)).toBe(2);
  });

  it('clamps warmth to the 0-1 range', () => {
    expect(quality({ ...plain, warmth: 5 }, start, config)).toBe(2);
    expect(quality({ ...plain, warmth: -1 }, start, config)).toBe(1);
  });
});

describe('pointsFor', () => {
  it('combines area position and quality', () => {
    expect(pointsFor(plain, start, config)).toBe(20);
    expect(pointsFor(plain, { ...start, inArea: 1 }, config)).toBe(5);
    expect(pointsFor({ ...plain, important: true }, start, config)).toBe(30);
    expect(pointsFor({ ...plain, areaId: null }, start, config)).toBe(10);
  });

  it('caps what one area can yield in a day', () => {
    let total = 0;
    for (let inArea = 0; inArea < 500; inArea++) total += pointsFor(plain, { ...start, inArea }, config);
    const ceiling = config.basePoints * (1 / (1 - config.repeatDecay) + config.firstInAreaBonus);
    expect(total).toBeCloseTo(ceiling, 6);
  });
});

describe('applyGain', () => {
  it('closes a share of the gap to the maximum', () => {
    expect(applyGain(0, 20, config)).toBeCloseTo(FIRST_TASK, 3);
    expect(applyGain(50, 20, config)).toBeCloseTo(50 + FIRST_TASK / 2, 3);
  });

  it('adds less the hotter it already is', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let heat = 0; heat < MAX_HEAT; heat++) {
      const gain = applyGain(heat, 20, config) - heat;
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(previous);
      previous = gain;
    }
  });

  it('never passes the maximum', () => {
    expect(applyGain(0, 1e9, config)).toBeLessThanOrEqual(MAX_HEAT);
    expect(applyGain(99.9, 1e9, config)).toBeLessThanOrEqual(MAX_HEAT);
    expect(applyGain(MAX_HEAT, 50, config)).toBe(MAX_HEAT);
  });

  it('does not care how points are split: 20 then 7 equals 27 at once', () => {
    expect(applyGain(applyGain(40, 20, config), 7, config)).toBeCloseTo(applyGain(40, 27, config), 10);
  });
});

describe('scoring a day', () => {
  it('diminishes within an area and starts afresh the next day', () => {
    const log = [fact(), fact({ at: T0 + HOUR_MS }), fact({ at: T0 + DAY_MS, dayKey: DAY_2 })];
    expect(pointsOf(log)).toEqual([20, 5, 20]);
  });

  it('pays a smaller bonus for each further area opened', () => {
    const log = [
      fact({ areaId: 'work' }),
      fact({ areaId: 'health', at: T0 + HOUR_MS }),
      fact({ areaId: 'home', at: T0 + 2 * HOUR_MS }),
    ];
    expect(pointsOf(log)).toEqual([20, 15, 12.5]);
  });

  it('does not count unfiled items as an opened area', () => {
    const log = [fact({ areaId: null }), fact({ areaId: 'work', at: T0 + HOUR_MS })];
    expect(pointsOf(log)).toEqual([10, 20]);
  });

  it('pays a smaller flag bonus for each further flagged completion', () => {
    const log = [
      fact({ areaId: 'work', important: true }),
      fact({ areaId: 'health', important: true, at: T0 + HOUR_MS }),
      fact({ areaId: 'home', important: true, avoided: true, at: T0 + 2 * HOUR_MS }),
      fact({ areaId: 'work', at: T0 + 3 * HOUR_MS }),
    ];
    expect(pointsOf(log)).toEqual([30, 18.75, 15.625, 5]);
  });

  it('starts area and flag positions afresh each day', () => {
    const log = [
      fact({ areaId: 'work', important: true }),
      fact({ areaId: 'health', important: true, at: T0 + HOUR_MS }),
      fact({ areaId: 'health', important: true, at: T0 + DAY_MS, dayKey: DAY_2 }),
    ];
    expect(pointsOf(log)).toEqual([30, 18.75, 30]);
  });
});

describe('foldHeat', () => {
  it('is zero with no history', () => {
    expect(foldHeat([], config, T0, DAY_1).heat).toBe(0);
  });

  it('applies a completion and then cools', () => {
    const log = [fact()];
    expect(foldHeat(log, config, T0, DAY_1).heat).toBeCloseTo(FIRST_TASK, 3);
    expect(foldHeat(log, config, T0 + DAY_MS, DAY_2).heat).toBeCloseTo(FIRST_TASK * 0.8, 3);
  });

  it('ignores completions that are still in the future', () => {
    const log = [fact(), fact({ at: T0 + HOUR_MS })];
    expect(foldHeat(log, config, T0, DAY_1).heat).toBeCloseTo(FIRST_TASK, 3);
  });

  it('gives the same answer whatever order the log arrives in', () => {
    const log = [
      fact({ at: T0 }),
      fact({ at: T0 + HOUR_MS, areaId: 'health' }),
      fact({ at: T0 + 2 * HOUR_MS, important: true }),
      fact({ at: T0 + DAY_MS, dayKey: DAY_2 }),
    ];
    const now = T0 + 2 * DAY_MS;
    const forward = foldHeat(log, config, now, DAY_2);
    const backward = foldHeat([...log].reverse(), config, now, DAY_2);
    expect(backward).toEqual(forward);
  });

  it('counts a task once however many times it was logged', () => {
    const once = [fact({ itemId: 'dishes' })];
    const twice = [...once, fact({ itemId: 'dishes', at: T0 + HOUR_MS })];
    const now = T0 + 2 * HOUR_MS;
    expect(foldHeat(twice, config, now, DAY_1).heat).toBe(foldHeat(once, config, now, DAY_1).heat);
  });

  it('counts a routine once per day, and again on another day', () => {
    const now = T0 + DAY_MS + HOUR_MS;
    const run = { itemId: 'run', kind: 'routine' as const };
    const oneDay = [fact(run)];
    const sameDayTwice = [...oneDay, fact({ ...run, at: T0 + HOUR_MS })];
    const twoDays = [...oneDay, fact({ ...run, at: T0 + DAY_MS, dayKey: DAY_2 })];

    const base = foldHeat(oneDay, config, now, DAY_2).heat;
    expect(foldHeat(sameDayTwice, config, now, DAY_2).heat).toBe(base);
    expect(foldHeat(twoDays, config, now, DAY_2).heat).toBeGreaterThan(base);
  });

  it("reports only today's position", () => {
    const later = { at: T0 + DAY_MS, dayKey: DAY_2 };
    const log = [
      fact({ important: true }),
      fact(later),
      fact({ ...later, avoided: true }),
      fact({ ...later, areaId: 'health' }),
      fact({ ...later, areaId: null }),
    ];
    const state = foldHeat(log, config, T0 + DAY_MS, DAY_2);
    expect(state.areaCounts).toEqual({ work: 2, health: 1, '': 1 });
    expect(state.flaggedToday).toBe(1);
  });
});

describe('traceHeat', () => {
  it('samples HEAT before, at and after a completion', () => {
    const { samples } = traceHeat([fact()], config, [T0 - 1, T0, T0 + DAY_MS]);
    expect(samples[0]).toBe(0);
    expect(samples[1]).toBeCloseTo(FIRST_TASK, 3);
    expect(samples[2]).toBeCloseTo(FIRST_TASK * 0.8, 3);
  });

  it('rejects sample times that go backwards', () => {
    expect(() => traceHeat([], config, [T0, T0 - 1])).toThrow();
  });
});

describe('pricing the next completion', () => {
  it('prices a first task in a fresh area above a repeat', () => {
    const state: HeatState = { ...empty, heat: 50, areaCounts: { work: 1 } };
    expect(gainFor(state, { ...plain, areaId: 'health' }, config)).toBeGreaterThan(gainFor(state, plain, config));
  });

  it('prices a flagged item lower once flags have been used today', () => {
    const flagged: Scorable = { ...plain, important: true };
    const used: HeatState = { ...empty, flaggedToday: 2 };
    expect(gainFor(used, flagged, config)).toBeLessThan(gainFor(empty, flagged, config));
    expect(gainFor(used, flagged, config)).toBeGreaterThan(gainFor(used, plain, config));
  });

  it('agrees with replaying the log', () => {
    const log = [fact({ avoided: true }), fact({ at: T0 + HOUR_MS, areaId: 'health' })];
    const now = T0 + 3 * HOUR_MS;
    const before = foldHeat(log, config, now, DAY_1);
    const item: Scorable = { ...plain, areaId: 'home', important: true };

    const predicted = afterCompleting(before, item, config);
    const replayed = foldHeat([...log, fact({ ...item, at: now })], config, now, DAY_1);

    expect(predicted.heat).toBeCloseTo(replayed.heat, 10);
    expect(predicted.areaCounts).toEqual(replayed.areaCounts);
    expect(predicted.flaggedToday).toBe(replayed.flaggedToday);
    expect(gainFor(before, item, config)).toBeCloseTo(replayed.heat - before.heat, 10);
  });
});
