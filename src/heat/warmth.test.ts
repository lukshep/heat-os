import { describe, expect, it } from 'vitest';
import { TEST_CONFIG as config } from './testConfig';
import { hit, isScheduledOn, miss, warmthAt, type Schedule, type WarmthBase, type WarmthState } from './warmth';

const cold: WarmthState = { warmth: 0, missRun: 0 };
const full: WarmthState = { warmth: 1, missRun: 0 };
const DAILY: Schedule = { days: [0, 1, 2, 3, 4, 5, 6] };
const MON_WED_FRI: Schedule = { days: [1, 3, 5] };

/** Sunday 4 January 2026, so the first settled day is Monday the 5th. */
const base: WarmthBase = { ...cold, asOf: '2026-01-04' };

const doHit = (state: WarmthState) => hit(state, config);
const doMiss = (state: WarmthState) => miss(state, config);

function repeat(state: WarmthState, times: number, step: (s: WarmthState) => WarmthState): WarmthState {
  let result = state;
  for (let i = 0; i < times; i++) result = step(result);
  return result;
}

/** Where warmth settles after many rounds of `hits` completions followed by one miss. */
function settled(hits: number): number {
  let state = cold;
  for (let round = 0; round < 200; round++) state = doMiss(repeat(state, hits, doHit));
  return state.warmth;
}

describe('hit', () => {
  it('closes a quarter of the gap to full warmth', () => {
    expect(doHit(cold).warmth).toBe(0.25);
    expect(doHit({ warmth: 0.6, missRun: 0 }).warmth).toBeCloseTo(0.7, 10);
  });

  it('warms up over roughly 5 to 10 completions', () => {
    expect(repeat(cold, 4, doHit).warmth).toBeLessThan(0.7);
    expect(repeat(cold, 5, doHit).warmth).toBeGreaterThan(0.75);
    expect(repeat(cold, 10, doHit).warmth).toBeGreaterThan(0.9);
  });

  it('never passes the ceiling', () => {
    expect(repeat(cold, 500, doHit).warmth).toBeLessThanOrEqual(1);
    expect(doHit(full).warmth).toBe(1);
  });

  it('clears the miss run', () => {
    expect(doHit(repeat(full, 2, doMiss)).missRun).toBe(0);
  });
});

describe('miss', () => {
  it('costs a fifth of the warmth for a single miss', () => {
    expect(doMiss(full).warmth).toBeCloseTo(0.8, 10);
    expect(doMiss({ warmth: 0.5, missRun: 0 }).warmth).toBeCloseTo(0.4, 10);
  });

  it('leaves a routine nearly cold after two misses in a row, and cold after three', () => {
    expect(repeat(full, 2, doMiss).warmth).toBeCloseTo(0.16, 10);
    expect(repeat(full, 3, doMiss).warmth).toBe(0);
    expect(repeat(full, 8, doMiss).warmth).toBe(0);
  });

  it('charges far more for misses in a row than for the same misses apart', () => {
    const inARow = repeat(full, 2, doMiss).warmth;
    const apart = doMiss({ ...doMiss(full), missRun: 0 }).warmth;
    expect(apart).toBeCloseTo(0.64, 10);
    expect(inARow).toBeLessThan(apart / 2);
  });

  it('starts counting again after a completion', () => {
    const recovered = doHit(repeat(full, 2, doMiss));
    const lost = 1 - doMiss(recovered).warmth / recovered.warmth;
    expect(lost).toBeCloseTo(config.missStep, 10);
  });

  it('settles lower the more often a routine is skipped', () => {
    const skippedEveryFifth = settled(4);
    const skippedEveryThird = settled(2);
    const skippedEveryOther = settled(1);
    expect(skippedEveryFifth).toBeLessThan(1);
    expect(skippedEveryThird).toBeLessThan(skippedEveryFifth);
    expect(skippedEveryOther).toBeLessThan(skippedEveryThird);
    expect(skippedEveryOther).toBeCloseTo(0.5, 10);
  });
});

describe('isScheduledOn', () => {
  it('matches weekdays', () => {
    expect(isScheduledOn(MON_WED_FRI, '2026-01-05')).toBe(true);
    expect(isScheduledOn(MON_WED_FRI, '2026-01-06')).toBe(false);
    expect(isScheduledOn(DAILY, '2026-01-06')).toBe(true);
  });
});

describe('warmthAt', () => {
  const threeDays = new Set(['2026-01-05', '2026-01-06', '2026-01-07']);
  const afterThreeHits = 1 - 0.75 ** 3;

  it('settles every scheduled day before today', () => {
    const state = warmthAt(base, DAILY, threeDays, '2026-01-08', config);
    expect(state.warmth).toBeCloseTo(afterThreeHits, 10);
    expect(state.missRun).toBe(0);
  });

  it('leaves today open: not done yet is not a miss', () => {
    const today = warmthAt(base, DAILY, threeDays, '2026-01-08', config);
    const tomorrow = warmthAt(base, DAILY, threeDays, '2026-01-09', config);
    expect(today.missRun).toBe(0);
    expect(tomorrow.missRun).toBe(1);
    expect(tomorrow.warmth).toBeCloseTo(afterThreeHits * 0.8, 10);
  });

  it("does not count today's completion until the day is over", () => {
    const done = new Set(['2026-01-05']);
    expect(warmthAt(base, DAILY, done, '2026-01-05', config).warmth).toBe(0);
    expect(warmthAt(base, DAILY, done, '2026-01-06', config).warmth).toBe(0.25);
  });

  it('ignores unscheduled days, completed or not', () => {
    const scheduledOnly = new Set(['2026-01-05', '2026-01-07']);
    const withExtra = new Set([...scheduledOnly, '2026-01-06']);
    const expected = warmthAt(base, MON_WED_FRI, scheduledOnly, '2026-01-09', config);
    expect(expected.warmth).toBeCloseTo(1 - 0.75 ** 2, 10);
    expect(expected.missRun).toBe(0);
    expect(warmthAt(base, MON_WED_FRI, withExtra, '2026-01-09', config)).toEqual(expected);
  });

  it('continues from the base rather than from zero', () => {
    const warmBase: WarmthBase = { warmth: 0.6, missRun: 1, asOf: '2026-01-04' };
    const state = warmthAt(warmBase, DAILY, new Set(), '2026-01-06', config);
    // The second miss in a row removes 0.2 * 2 * 2 = 80% of what is left.
    expect(state.missRun).toBe(2);
    expect(state.warmth).toBeCloseTo(0.12, 10);
  });
});
