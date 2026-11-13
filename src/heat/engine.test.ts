import { describe, expect, it } from 'vitest';
import { FULL_HEAT, MAX_HEAT, STANDARD_TUNING, tuned } from './config';
import { DAY_MS, HOUR_MS } from './day';
import {
  afterCompleting,
  applyGain,
  areaFactor,
  configAt,
  cool,
  coolBetween,
  flagPoints,
  foldHeat,
  gainFor,
  pointsFor,
  traceHeat,
  warmthFactor,
  type CompletionFact,
  type ConfigTimeline,
  type DayPosition,
  type HeatState,
  type Scorable,
} from './engine';
import { TEST_CONFIG as config } from './testConfig';

const DAY_1 = '2026-01-05';
const DAY_2 = '2026-01-06';
const T0 = Date.UTC(2026, 0, 5, 12);

/** HEAT after one 20-point completion from cold: 120 * (1 - e^-0.2). */
const FIRST_TASK = 21.752;

const plain: Scorable = { areaId: 'work', important: false, avoided: false, warmth: 0 };
const start: DayPosition = { inArea: 0, areasOpened: 0 };

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

const empty: HeatState = { heat: 0, now: T0, today: DAY_1, areaCounts: {} };

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

describe('cooling in Surge', () => {
  it('is slower above a full gauge', () => {
    // 110 at the Surge rate of 10% a day is still above 100 after half a day.
    expect(cool(110, DAY_MS / 2, config)).toBeCloseTo(110 * Math.sqrt(0.9), 10);
    expect(cool(110, DAY_MS / 2, config)).toBeGreaterThan(110 * Math.sqrt(0.8));
  });

  it('goes back to the ordinary rate once it is down to full', () => {
    const daysToFull = Math.log(FULL_HEAT / 110) / Math.log(0.9);
    expect(cool(110, daysToFull * DAY_MS, config)).toBeCloseTo(FULL_HEAT, 8);
    expect(cool(110, (daysToFull + 1) * DAY_MS, config)).toBeCloseTo(80, 8);
  });

  it('has no step where the two rates meet', () => {
    const justAbove = cool(100.0001, HOUR_MS, config);
    const justBelow = cool(99.9999, HOUR_MS, config);
    expect(justAbove - justBelow).toBeLessThan(0.001);
    expect(justAbove).toBeGreaterThan(justBelow);
  });

  it('is continuous across the boundary: two steps equal one', () => {
    const twoSteps = cool(cool(112, 20 * HOUR_MS, config), 30 * HOUR_MS, config);
    expect(twoSteps).toBeCloseTo(cool(112, 50 * HOUR_MS, config), 8);
  });

  it('always cools, and never below where plain cooling from full would be', () => {
    let previous = 118;
    for (let hours = 1; hours <= 72; hours++) {
      const level = cool(118, hours * HOUR_MS, config);
      expect(level).toBeLessThan(previous);
      previous = level;
    }
    expect(cool(118, 3 * DAY_MS, config)).toBeGreaterThan(cool(100, 3 * DAY_MS, config));
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

describe('warmth and flags', () => {
  it('multiplies a routine by its warmth, clamped to 0-1', () => {
    expect(warmthFactor(plain, config)).toBe(1);
    expect(warmthFactor({ ...plain, warmth: 0.5 }, config)).toBe(1.5);
    expect(warmthFactor({ ...plain, warmth: 1 }, config)).toBe(2);
    expect(warmthFactor({ ...plain, warmth: 5 }, config)).toBe(2);
    expect(warmthFactor({ ...plain, warmth: -1 }, config)).toBe(1);
  });

  it('adds flat points for each flag', () => {
    expect(flagPoints(plain, config)).toBe(0);
    expect(flagPoints({ ...plain, important: true }, config)).toBe(5);
    expect(flagPoints({ ...plain, avoided: true }, config)).toBe(5);
    expect(flagPoints({ ...plain, important: true, avoided: true }, config)).toBe(10);
  });
});

describe('pointsFor', () => {
  it('combines area position, warmth and flags', () => {
    expect(pointsFor(plain, start, config)).toBe(20);
    expect(pointsFor(plain, { ...start, inArea: 1 }, config)).toBe(5);
    expect(pointsFor({ ...plain, warmth: 1 }, start, config)).toBe(40);
    expect(pointsFor({ ...plain, important: true }, start, config)).toBe(25);
    expect(pointsFor({ ...plain, areaId: null }, start, config)).toBe(10);
  });

  it('pays a flag in full however many tasks the area has already had', () => {
    const flagged: Scorable = { ...plain, important: true, avoided: true };
    for (const inArea of [0, 1, 4, 20]) {
      const position = { ...start, inArea };
      expect(pointsFor(flagged, position, config) - pointsFor(plain, position, config)).toBeCloseTo(10, 10);
    }
  });

  it('does not scale a flag with warmth', () => {
    const warm: Scorable = { ...plain, warmth: 1 };
    expect(pointsFor({ ...warm, important: true }, start, config) - pointsFor(warm, start, config)).toBe(5);
  });

  it('caps what plain tasks in one area can yield in a day', () => {
    let total = 0;
    for (let inArea = 0; inArea < 500; inArea++) total += pointsFor(plain, { ...start, inArea }, config);
    const ceiling = config.basePoints * (1 / (1 - config.repeatDecay) + config.firstInAreaBonus);
    expect(total).toBeCloseTo(ceiling, 6);
  });
});

describe('applyGain', () => {
  it('closes a share of the gap to the ceiling', () => {
    expect(applyGain(0, 20, config)).toBeCloseTo(FIRST_TASK, 3);
    expect(applyGain(60, 20, config)).toBeCloseTo(60 + FIRST_TASK / 2, 3);
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

  it('can pass a full gauge but never the ceiling', () => {
    expect(applyGain(95, 100, config)).toBeGreaterThan(FULL_HEAT);
    expect(applyGain(0, 1e9, config)).toBeLessThanOrEqual(MAX_HEAT);
    expect(applyGain(119.9, 1e9, config)).toBeLessThanOrEqual(MAX_HEAT);
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

  it('pays every flag in full, however many have been used today', () => {
    const log = [
      fact({ areaId: 'work', important: true }),
      fact({ areaId: 'work', important: true, at: T0 + HOUR_MS }),
      fact({ areaId: 'work', important: true, avoided: true, at: T0 + 2 * HOUR_MS }),
      fact({ areaId: 'work', at: T0 + 3 * HOUR_MS }),
    ];
    expect(pointsOf(log)).toEqual([25, 10, 12.5, 1.25]);
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
      fact(),
      fact(later),
      fact({ ...later, avoided: true }),
      fact({ ...later, areaId: 'health' }),
      fact({ ...later, areaId: null }),
    ];
    const state = foldHeat(log, config, T0 + DAY_MS, DAY_2);
    expect(state.areaCounts).toEqual({ work: 2, health: 1, '': 1 });
  });

  it('can carry HEAT past a full gauge', () => {
    const log = Array.from({ length: 12 }, (_, index) =>
      fact({ areaId: `area-${index}`, important: true, avoided: true, warmth: 1, kind: 'routine' }),
    );
    const heat = foldHeat(log, config, T0, DAY_1).heat;
    expect(heat).toBeGreaterThan(FULL_HEAT);
    expect(heat).toBeLessThan(MAX_HEAT);
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

  it('keeps a flagged item worth doing deep into a worked area', () => {
    const worked: HeatState = { ...empty, heat: 50, areaCounts: { work: 6 } };
    const flagged: Scorable = { ...plain, important: true };
    expect(gainFor(worked, flagged, config)).toBeGreaterThan(10 * gainFor(worked, plain, config));
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
    expect(gainFor(before, item, config)).toBeCloseTo(replayed.heat - before.heat, 10);
  });
});

describe('Effort and Cooling', () => {
  it('change nothing on Standard', () => {
    expect(tuned(config, STANDARD_TUNING)).toEqual(config);
  });

  it('scale the gain scale for Effort', () => {
    expect(tuned(config, { ...STANDARD_TUNING, effort: 'easier' }).gainScale).toBeCloseTo(75, 10);
    expect(tuned(config, { ...STANDARD_TUNING, effort: 'harder' }).gainScale).toBeCloseTo(130, 10);
  });

  it('move the daily retention for Cooling, and leave points and the Surge rate alone', () => {
    const slower = tuned(config, { ...STANDARD_TUNING, cooling: 'slower' });
    expect(slower.dailyRetention).toBeCloseTo(0.85, 10);
    expect(slower.surgeRetention).toBe(config.surgeRetention);
    expect(slower.gainScale).toBe(config.gainScale);

    const faster = tuned(config, { ...STANDARD_TUNING, cooling: 'faster' });
    expect(faster.dailyRetention).toBeCloseTo(0.75, 10);
    expect(faster.surgeRetention).toBe(config.surgeRetention);
  });

  it('never let Surge cool faster than the rest of the gauge', () => {
    const close = { ...config, dailyRetention: 0.8, surgeRetention: 0.82 };
    expect(tuned(close, { ...STANDARD_TUNING, cooling: 'slower' }).surgeRetention).toBeCloseTo(0.85, 10);
  });
});

describe('a config that changes over time', () => {
  const later = { ...config, dailyRetention: 0.5, gainScale: 200 };
  const changeAt = (from: number): ConfigTimeline => [
    { from: Number.NEGATIVE_INFINITY, config },
    { from, config: later },
  ];

  it('is in force from the moment it is made', () => {
    const timeline = changeAt(T0);
    expect(configAt(timeline, T0 - 1)).toBe(config);
    expect(configAt(timeline, T0)).toBe(later);
    expect(configAt(timeline, T0 + DAY_MS)).toBe(later);
  });

  it('leaves the first config covering all time before the second', () => {
    expect(configAt([{ from: T0, config }], T0 - DAY_MS)).toBe(config);
  });

  it('cools each stretch at the rate in force over it', () => {
    expect(coolBetween(50, T0, T0 + 2 * DAY_MS, changeAt(T0 + DAY_MS))).toBeCloseTo(50 * 0.8 * 0.5, 10);
    expect(coolBetween(50, T0, T0 + DAY_MS, changeAt(T0 + 2 * DAY_MS))).toBeCloseTo(50 * 0.8, 10);
  });

  it('gives the same HEAT as a single config when nothing has changed', () => {
    const log = [fact(), fact({ at: T0 + HOUR_MS, areaId: 'health' }), fact({ at: T0 + DAY_MS, dayKey: DAY_2 })];
    const now = T0 + 2 * DAY_MS;
    expect(foldHeat(log, [{ from: Number.NEGATIVE_INFINITY, config }], now, DAY_2)).toEqual(
      foldHeat(log, config, now, DAY_2),
    );
  });

  it('does not move HEAT already earned', () => {
    const log = [fact(), fact({ at: T0 + HOUR_MS, areaId: 'health' })];
    const now = T0 + 3 * HOUR_MS;
    expect(foldHeat(log, changeAt(now), now, DAY_1).heat).toBe(foldHeat(log, config, now, DAY_1).heat);
    expect(foldHeat(log, changeAt(now + DAY_MS), now, DAY_1).heat).toBe(foldHeat(log, config, now, DAY_1).heat);
  });

  it('scores completions after the change with the new config, and those before it with the old', () => {
    const second = fact({ at: T0 + 2 * HOUR_MS, areaId: 'health' });
    const { scored } = traceHeat([fact(), second], changeAt(T0 + HOUR_MS), [second.at]);
    expect(scored[0]?.heatAfter).toBeCloseTo(FIRST_TASK, 3);

    const cooled = cool(FIRST_TASK, HOUR_MS, config);
    const cooledAgain = cool(cooled, HOUR_MS, later);
    const points = pointsFor(second, { inArea: 0, areasOpened: 1 }, later);
    expect(scored[1]?.heatAfter).toBeCloseTo(applyGain(cooledAgain, points, later), 3);
  });

  it('cools at the new rate from the moment of the change', () => {
    const heat = foldHeat([fact()], changeAt(T0 + DAY_MS), T0 + 2 * DAY_MS, DAY_2).heat;
    expect(heat).toBeCloseTo(FIRST_TASK * 0.8 * 0.5, 3);
  });
});
