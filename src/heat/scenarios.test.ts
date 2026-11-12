import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as config, MAX_HEAT } from './config';
import { DAY_MS, HOUR_MS } from './day';
import { cool, gainFor, pointsFor, type HeatState, type Scorable } from './engine';
import { SCENARIOS, simulate, type Scenario } from './sim';

/** A daily pattern done in one sitting at 18:00, which is how docs/SPEC.md states its figures. */
function daily(overrides: Partial<Scenario>): Scenario {
  return {
    name: 'test',
    note: '',
    daysOn: 1,
    daysOff: 0,
    areas: 1,
    tasks: 1,
    important: 0,
    avoided: 0,
    routines: 0,
    skipRoutinesEvery: 0,
    fromHour: 18,
    toHour: 18,
    ...overrides,
  };
}

const MAINTENANCE = daily({ areas: 4, tasks: 8 });
const DEEP = daily({ areas: 3, tasks: 9 });
const BIG = daily({ areas: 4, tasks: 12, important: 1 });
const LIGHT = daily({ areas: 3, tasks: 6 });
const ONE_PER_AREA = daily({ areas: 5, tasks: 5 });
const ONE_AREA_UNLIMITED = daily({ areas: 1, tasks: 200 });
const ROUTINES_AND_TASKS = daily({ areas: 3, tasks: 3, routines: 3, fromHour: 8, toHour: 20 });

const SETTLED = 56;
const plain: Scorable = { areaId: 'work', important: false, avoided: false, warmth: 0 };
const cold: HeatState = { heat: 0, now: 0, today: '2026-01-05', areaCounts: {}, flaggedToday: 0 };

function pointsADay(scenario: Scenario): number {
  return simulate(scenario, config, 1).stats.pointsPerActiveDay;
}

/**
 * What the design promises. The aim is to bring HEAT up to the line at some point each day.
 * These should survive retuning; if one has to change, the product has changed and
 * docs/SPEC.md needs to say so.
 */
describe('design invariants', () => {
  it('brings a maintenance day up to the line every day', () => {
    const { stats } = simulate(MAINTENANCE, config, SETTLED);
    expect(stats.daysAtLine).toBe(1);
  });

  it('lets depth stand in for a fourth area', () => {
    expect(simulate(DEEP, config, SETTLED).stats.daysAtLine).toBe(1);
  });

  it('does not let one task in each area reach the line', () => {
    const { stats } = simulate(ONE_PER_AREA, config, SETTLED);
    expect(stats.settledPeak).toBeLessThan(config.threshold);
    expect(stats.reachesLineOnDay).toBeNull();
  });

  it('does not let one area reach the line, however much is done', () => {
    const { stats } = simulate(ONE_AREA_UNLIMITED, config, SETTLED);
    expect(stats.settledPeak).toBeLessThan(config.threshold);
  });

  it('pays less than four times as much for one task split into twenty', () => {
    expect(pointsADay(daily({ tasks: 20 }))).toBeLessThan(4 * pointsADay(daily({ tasks: 1 })));
  });

  it('rewards breadth over depth', () => {
    const deep = pointsADay(daily({ areas: 1, tasks: 4 }));
    const broad = pointsADay(daily({ areas: 4, tasks: 4 }));
    expect(broad).toBeGreaterThan(1.25 * deep);
  });

  it('keeps returns within an area worthwhile over several tasks', () => {
    const fourth = pointsFor(plain, { inArea: 3, areasOpened: 1, flagged: 0 }, config);
    const eighth = pointsFor(plain, { inArea: 7, areasOpened: 1, flagged: 0 }, config);
    expect(fourth).toBeGreaterThan(config.basePoints / 3);
    expect(eighth).toBeLessThan(config.basePoints / 3);
  });

  it('pays a smaller bonus for every further area, but always more than a repeat', () => {
    const first = (areasOpened: number) => pointsFor(plain, { inArea: 0, areasOpened, flagged: 0 }, config);
    const repeat = pointsFor(plain, { inArea: 1, areasOpened: 1, flagged: 0 }, config);
    for (let opened = 1; opened < 8; opened++) {
      expect(first(opened)).toBeLessThan(first(opened - 1));
      expect(first(opened)).toBeGreaterThan(repeat);
    }
  });

  it('stays within 0-100 under absurd farming', () => {
    const absurd = daily({ areas: 6, tasks: 300, important: 300, avoided: 300, routines: 6 });
    const heats = simulate(absurd, config, 60).samples.map((sample) => sample.heat);
    expect(Math.min(...heats)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...heats)).toBeLessThanOrEqual(MAX_HEAT);
    expect(Math.max(...heats)).toBeGreaterThan(config.threshold);
  });

  it('carries very high HEAT through a day of inactivity', () => {
    // 75 is still at the line a full day later; 86 is still there the morning after a skipped day.
    expect(cool(75, DAY_MS, config)).toBeGreaterThanOrEqual(config.threshold);
    expect(cool(86, 38 * HOUR_MS, config)).toBeGreaterThanOrEqual(config.threshold);
  });

  it('makes the first task from cold move the bar', () => {
    expect(gainFor(cold, plain, config)).toBeGreaterThanOrEqual(4);
  });

  it('gets back to the line from cold within a week of maintenance days, sooner with big ones', () => {
    const maintenance = simulate(MAINTENANCE, config, 14).stats.reachesLineOnDay;
    const big = simulate(BIG, config, 14).stats.reachesLineOnDay;
    expect(maintenance ?? Infinity).toBeLessThan(7);
    expect(big ?? Infinity).toBeLessThan(4);
  });

  it('does not let weekend bursts stand in for consistency', () => {
    const weekendWarrior = { ...BIG, daysOn: 2, daysOff: 5 };
    expect(simulate(weekendWarrior, config, 42).stats.daysAtLine).toBeLessThan(0.5);
  });

  it('recovers within four big days of returning from a week away', () => {
    const weekOff = { ...BIG, daysOn: 14, daysOff: 7 };
    const { samples } = simulate(weekOff, config, 42);
    // Days 14-20 are off; day 21 is the first day back and day 24 the fourth.
    const fourthDayBack = samples.filter((sample) => sample.day >= 24 && sample.day < 25);
    expect(Math.max(...fourthDayBack.map((sample) => sample.heat))).toBeGreaterThanOrEqual(config.threshold);
  });

  it('makes a kept routine worth nearly twice a new one', () => {
    const kept = daily({ areas: 1, tasks: 0, routines: 1 });
    const { scored, stats } = simulate(kept, config, 21);
    const first = scored[0]?.points ?? 0;
    const last = scored[scored.length - 1]?.points ?? 0;
    expect(first).toBeCloseTo(pointsFor(plain, { inArea: 0, areasOpened: 0, flagged: 0 }, config), 6);
    expect(last).toBeGreaterThan(1.9 * first);
    expect(stats.routineWarmth ?? 0).toBeGreaterThan(0.95);
  });

  it('keeps a patchy routine cooler than a kept one', () => {
    const warmthOf = (skipRoutinesEvery: number) =>
      simulate(daily({ tasks: 0, routines: 1, skipRoutinesEvery }), config, 30).stats.routineWarmth ?? 0;
    expect(warmthOf(3)).toBeLessThan(warmthOf(0));
    expect(warmthOf(2)).toBeLessThan(warmthOf(3));
  });

  it('lets consistency carry a day over the line that the same effort leaves short', () => {
    // Six completions across three areas: short as plain tasks, enough once three of them are warm routines.
    expect(simulate(LIGHT, config, SETTLED).stats.settledPeak).toBeLessThan(config.threshold);
    expect(simulate(ROUTINES_AND_TASKS, config, SETTLED).stats.daysAtLine).toBe(1);
  });
});

/**
 * The table in docs/SPEC.md under "Expected behaviour". These figures move whenever
 * DEFAULT_CONFIG is retuned: update them, the table and the tuning log together.
 */
describe('calibration snapshot', () => {
  const table: [string, Scenario, number][] = [
    ['one task in each of 5 areas', ONE_PER_AREA, 54],
    ['one task in each of 6 areas', daily({ areas: 6, tasks: 6 }), 59],
    ['two tasks in each of 3 areas', LIGHT, 55],
    ['two tasks in each of 4 areas', MAINTENANCE, 62],
    ['three tasks in each of 3 areas', DEEP, 62],
    ['three tasks in each of 4 areas', daily({ areas: 4, tasks: 12 }), 69],
    ['one area, unlimited tasks', ONE_AREA_UNLIMITED, 50],
    ['three warm routines alone', { ...ROUTINES_AND_TASKS, tasks: 0 }, 58],
    ['three warm routines and three tasks', ROUTINES_AND_TASKS, 65],
  ];

  it.each(table)('%s peaks where the spec says', (_name, scenario, peak) => {
    expect(Math.round(simulate(scenario, config, SETTLED).stats.settledPeak)).toBe(peak);
  });

  it('scores the reference days as the spec says', () => {
    expect(pointsADay(ONE_PER_AREA)).toBeCloseTo(63.87, 2);
    expect(pointsADay(MAINTENANCE)).toBeCloseTo(84.67, 2);
    expect(pointsADay(DEEP)).toBeCloseTo(84.15, 2);
  });
});

describe('presets', () => {
  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))('%s runs cleanly', (_name, scenario) => {
    const { samples, stats } = simulate(scenario, config, 42);
    expect(samples.length).toBeGreaterThan(42 * 24);
    expect(samples.every((sample) => Number.isFinite(sample.heat))).toBe(true);
    expect(stats.settledPeak).toBeGreaterThan(0);
    expect(stats.daysAtLine).toBeGreaterThanOrEqual(0);
    expect(stats.daysAtLine).toBeLessThanOrEqual(1);
  });
});
