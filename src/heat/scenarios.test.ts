import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG as config,
  FULL_HEAT,
  MAX_HEAT,
  COOLINGS,
  EFFORTS,
  STANDARD_TUNING,
  tuned,
  type Tuning,
} from './config';
import { DAY_MS, HOUR_MS } from './day';
import { applyGain, cool, gainFor, pointsFor, type HeatState, type Scorable } from './engine';
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

const BALANCED = daily({ areas: 4, tasks: 8 });
const BALANCED_FLAGGED = daily({ areas: 4, tasks: 8, important: 1, avoided: 1 });
const LIGHT = daily({ areas: 3, tasks: 6 });
const BIG = daily({ areas: 4, tasks: 12, important: 1, avoided: 1 });
const HUGE = daily({ areas: 4, tasks: 12, important: 2, avoided: 2, routines: 3 });
const ONE_PER_AREA = daily({ areas: 5, tasks: 5 });
const ONE_AREA_UNLIMITED = daily({ areas: 1, tasks: 200 });
const ROUTINES_AND_TASKS = daily({ areas: 3, tasks: 3, routines: 3, fromHour: 8, toHour: 20 });

const SETTLED = 56;
const plain: Scorable = { areaId: 'work', important: false, avoided: false, warmth: 0 };
const cold: HeatState = { heat: 0, now: 0, today: '2026-01-05', areaCounts: {} };

function pointsADay(scenario: Scenario): number {
  return simulate(scenario, config, 1).stats.pointsPerActiveDay;
}

function settled(scenario: Scenario) {
  return simulate(scenario, config, SETTLED).stats;
}

/**
 * What the design promises. HEAT is a gauge of recent activity and consistency, with no line
 * to reach and no daily pass or fail. These should survive retuning; if one has to change,
 * the product has changed and docs/SPEC.md needs to say so.
 */
describe('design invariants', () => {
  it('keeps consistent, balanced activity at about 70 to 85', () => {
    const { settledPeak, settledLow } = settled(BALANCED);
    expect(settledPeak).toBeGreaterThan(80);
    expect(settledPeak).toBeLessThan(90);
    expect(settledLow).toBeGreaterThan(65);
    expect(settledLow).toBeLessThan(75);
  });

  it('does not let a balanced day fill the gauge, however long it is kept up', () => {
    const { settledPeak, surgeShare } = settled(BALANCED);
    expect(settledPeak).toBeLessThan(FULL_HEAT);
    expect(surgeShare).toBe(0);
  });

  it('makes a full gauge hard: two balanced days of work in one day is not enough', () => {
    const low = settled(BALANCED).settledLow;
    expect(applyGain(low, 2 * pointsADay(BALANCED), config)).toBeLessThan(FULL_HEAT);
  });

  it('makes a full gauge possible: a huge day, kept up, surges', () => {
    const { settledPeak, surgeShare } = settled(HUGE);
    expect(settledPeak).toBeGreaterThan(FULL_HEAT);
    expect(surgeShare).toBeGreaterThan(0);
    expect(surgeShare).toBeLessThan(1);
  });

  it('never passes the ceiling, even under absurd farming', () => {
    const absurd = daily({ areas: 6, tasks: 300, important: 300, avoided: 300, routines: 6 });
    const heats = simulate(absurd, config, 60).samples.map((sample) => sample.heat);
    expect(Math.min(...heats)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...heats)).toBeLessThanOrEqual(MAX_HEAT);
  });

  it('lets a Surge hold its heat longer than ordinary cooling would', () => {
    const plainRate = { ...config, surgeRetention: config.dailyRetention };
    expect(cool(110, 12 * HOUR_MS, config)).toBeGreaterThan(FULL_HEAT);
    expect(cool(110, 12 * HOUR_MS, plainRate)).toBeLessThan(FULL_HEAT);
    expect(cool(110, DAY_MS, config)).toBeGreaterThan(cool(110, DAY_MS, plainRate));
  });

  it('does not let Surge become permanent for a huge day', () => {
    expect(settled(HUGE).settledLow).toBeLessThan(FULL_HEAT);
  });

  it('builds quickly from cold and slowly near the top', () => {
    const low = gainFor(cold, plain, config);
    const high = gainFor({ ...cold, heat: 95 }, plain, config);
    expect(low).toBeGreaterThanOrEqual(6);
    expect(high).toBeLessThan(low / 3);
  });

  it('does not punish a day of rest', () => {
    const { settledPeak } = settled(BALANCED);
    expect(cool(settledPeak, DAY_MS, config)).toBeGreaterThan(65);
    expect(cool(settledPeak, 2 * DAY_MS, config)).toBeGreaterThan(50);
  });

  it('comes back within three balanced days of a week away', () => {
    const weekOff = { ...BALANCED, daysOn: 14, daysOff: 7 };
    const { samples } = simulate(weekOff, config, 42);
    // Days 14-20 are off; day 21 is the first day back and day 23 the third.
    const thirdDayBack = samples.filter((sample) => sample.day >= 23 && sample.day < 24);
    expect(Math.max(...thirdDayBack.map((sample) => sample.heat))).toBeGreaterThan(70);
  });

  it('pays a flag in full wherever the task falls in its area', () => {
    const flagged: Scorable = { ...plain, important: true };
    const bonusAt = (inArea: number) => {
      const position = { inArea, areasOpened: 1 };
      return pointsFor(flagged, position, config) - pointsFor(plain, position, config);
    };
    expect(bonusAt(0)).toBeCloseTo(bonusAt(6), 10);
    expect(bonusAt(6)).toBeGreaterThanOrEqual(config.basePoints / 2);
  });

  it('makes a flagged task deep in an area worth about as much as a fresh start elsewhere', () => {
    const both: Scorable = { ...plain, important: true, avoided: true };
    const deepAndFlagged = pointsFor(both, { inArea: 3, areasOpened: 1 }, config);
    const freshArea = pointsFor(plain, { inArea: 0, areasOpened: 1 }, config);
    expect(deepAndFlagged).toBeGreaterThan(freshArea);
  });

  it('lifts a balanced day when two of its tasks are flagged', () => {
    expect(settled(BALANCED_FLAGGED).settledPeak).toBeGreaterThan(settled(BALANCED).settledPeak + 3);
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
    const fourth = pointsFor(plain, { inArea: 3, areasOpened: 1 }, config);
    const eighth = pointsFor(plain, { inArea: 7, areasOpened: 1 }, config);
    expect(fourth).toBeGreaterThan(config.basePoints / 3);
    expect(eighth).toBeLessThan(config.basePoints / 3);
  });

  it('keeps one area, however hard it is worked, below a balanced day', () => {
    expect(settled(ONE_AREA_UNLIMITED).settledPeak).toBeLessThan(settled(BALANCED).settledPeak - 10);
  });

  it('does not let weekend bursts stand in for consistency', () => {
    const weekendWarrior = settled({ ...BIG, daysOn: 2, daysOff: 5 });
    expect(weekendWarrior.settledLow).toBeLessThan(settled(BALANCED).settledLow / 2);
    expect(weekendWarrior.settledPeak).toBeLessThan(settled(BIG).settledPeak);
  });

  it('makes a kept routine worth nearly twice a new one', () => {
    const kept = daily({ areas: 1, tasks: 0, routines: 1 });
    const { scored, stats } = simulate(kept, config, 21);
    const first = scored[0]?.points ?? 0;
    const last = scored[scored.length - 1]?.points ?? 0;
    expect(first).toBeCloseTo(pointsFor(plain, { inArea: 0, areasOpened: 0 }, config), 6);
    expect(last).toBeGreaterThan(1.9 * first);
    expect(stats.routineWarmth ?? 0).toBeGreaterThan(0.95);
  });

  it('keeps a patchy routine cooler than a kept one', () => {
    const warmthOf = (skipRoutinesEvery: number) =>
      simulate(daily({ tasks: 0, routines: 1, skipRoutinesEvery }), config, 30).stats.routineWarmth ?? 0;
    expect(warmthOf(3)).toBeLessThan(warmthOf(0));
    expect(warmthOf(2)).toBeLessThan(warmthOf(3));
  });

  it('lets consistency lift the same effort: warm routines beat the same count of plain tasks', () => {
    expect(settled(ROUTINES_AND_TASKS).settledPeak).toBeGreaterThan(settled(LIGHT).settledPeak + 5);
  });
});

/**
 * The table in docs/SPEC.md under "Expected behaviour". These figures move whenever
 * DEFAULT_CONFIG is retuned: update them, the table and the tuning log together.
 */
describe('calibration snapshot', () => {
  const table: [string, Scenario, number, number][] = [
    ['one task in each of 5 areas', ONE_PER_AREA, 76, 61],
    ['light day', LIGHT, 77, 61],
    ['balanced day', BALANCED, 85, 68],
    ['balanced day, two flagged', BALANCED_FLAGGED, 90, 72],
    ['big day', BIG, 96, 77],
    ['huge day', HUGE, 107, 88],
    ['one area, unlimited tasks', ONE_AREA_UNLIMITED, 71, 57],
  ];

  it.each(table)('%s settles where the spec says', (_name, scenario, peak, low) => {
    const stats = settled(scenario);
    expect(Math.round(stats.settledPeak)).toBe(peak);
    expect(Math.round(stats.settledLow)).toBe(low);
  });

  it('scores the reference days as the spec says', () => {
    expect(pointsADay(BALANCED)).toBeCloseTo(84.67, 2);
    expect(pointsADay(BALANCED_FLAGGED)).toBeCloseTo(99.67, 2);
    expect(pointsADay(LIGHT)).toBeCloseTo(64.95, 2);
  });

  it('needs about 206 points in a day to fill the gauge from a balanced routine', () => {
    const low = settled(BALANCED).settledLow;
    const needed = -config.gainScale * Math.log((MAX_HEAT - FULL_HEAT) / (MAX_HEAT - low));
    expect(Math.round(needed)).toBe(206);
  });
});

describe('presets', () => {
  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))('%s runs cleanly', (_name, scenario) => {
    const { samples, stats } = simulate(scenario, config, 42);
    expect(samples.length).toBeGreaterThan(42 * 24);
    expect(samples.every((sample) => Number.isFinite(sample.heat))).toBe(true);
    expect(stats.settledPeak).toBeGreaterThan(0);
    expect(stats.surgeShare).toBeGreaterThanOrEqual(0);
    expect(stats.surgeShare).toBeLessThanOrEqual(1);
  });
});

/**
 * A person's own Effort and Cooling. Effort moves what counts as a normal day; Cooling
 * changes only how fast HEAT fades, so it also moves where the same days sit.
 */
describe('Effort and Cooling', () => {
  const HEAVY = daily({ areas: 4, tasks: 12 });
  const EVERY_TUNING = EFFORTS.flatMap((effort) => COOLINGS.map((cooling): Tuning => ({ effort, cooling })));

  const on = (tuning: Partial<Tuning>) => tuned(config, { ...STANDARD_TUNING, ...tuning });
  const settledOn = (scenario: Scenario, tuning: Partial<Tuning>) => simulate(scenario, on(tuning), SETTLED).stats;

  /** Within a couple of points: the steps are round numbers, not solved exactly. */
  const sitsWith = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(2);

  it('on Easier, holds a light day where a balanced day sits on Standard', () => {
    sitsWith(settledOn(LIGHT, { effort: 'easier' }).settledPeak, settled(BALANCED).settledPeak);
    sitsWith(settledOn(LIGHT, { effort: 'easier' }).settledLow, settled(BALANCED).settledLow);
  });

  it('on Harder, takes three tasks in each of four areas to sit there', () => {
    sitsWith(settledOn(HEAVY, { effort: 'harder' }).settledPeak, settled(BALANCED).settledPeak);
    sitsWith(settledOn(HEAVY, { effort: 'harder' }).settledLow, settled(BALANCED).settledLow);
  });

  it('with Slower cooling, makes a day off cost less and lets the same days sit higher', () => {
    const standard = settled(BALANCED);
    const slower = settledOn(BALANCED, { cooling: 'slower' });
    expect(slower.settledPeak).toBeGreaterThan(standard.settledPeak + 3);
    expect(slower.settledPeak - slower.settledLow).toBeLessThan(standard.settledPeak - standard.settledLow);
  });

  it('with Faster cooling, does the opposite', () => {
    const standard = settled(BALANCED);
    const faster = settledOn(BALANCED, { cooling: 'faster' });
    expect(faster.settledPeak).toBeLessThan(standard.settledPeak - 3);
    expect(faster.settledPeak - faster.settledLow).toBeGreaterThan(standard.settledPeak - standard.settledLow);
  });

  it.each(EVERY_TUNING.map((tuning) => [`${tuning.effort}, ${tuning.cooling}`, tuning] as const))(
    'on %s, never lets a balanced day fill the gauge or a huge day surge for good',
    (_name, tuning) => {
      expect(settledOn(BALANCED, tuning).surgeShare).toBe(0);
      expect(settledOn(HUGE, tuning).settledLow).toBeLessThan(FULL_HEAT);
    },
  );
});
