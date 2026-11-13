import type { HeatConfig } from './config';

/**
 * Round numbers for unit tests, so expected values can be worked out by hand and do not
 * move when DEFAULT_CONFIG is retuned. Only scenarios.test.ts tests the real defaults.
 *
 * In one area, plain tasks are worth 20, 5, 2.5. The first task in the first, second and
 * third area of a day is worth 20, 15, 12.5. Each flag adds a flat 5.
 */
export const TEST_CONFIG: HeatConfig = {
  dailyRetention: 0.8,
  surgeRetention: 0.9,
  gainScale: 100,
  basePoints: 10,
  firstInAreaBonus: 1,
  areaBonusDecay: 0.5,
  repeatDecay: 0.5,
  importantBonus: 0.5,
  avoidedBonus: 0.5,
  warmthBonus: 1,
  warmthStep: 0.25,
  missStep: 0.2,
  dayStartHour: 4,
};
