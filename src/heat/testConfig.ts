import type { HeatConfig } from './config';

/**
 * Round numbers for unit tests, so expected values can be worked out by hand and do not
 * move when DEFAULT_CONFIG is retuned. Only scenarios.test.ts tests the real defaults.
 *
 * In an area, plain tasks are worth 20, 10, 5, 2.5, and every area starts again at 20. With
 * no area, 10, 5, 2.5. Each star of Friction adds 20% of an item's reward, so five stars
 * double it.
 */
export const TEST_CONFIG: HeatConfig = {
  dailyRetention: 0.8,
  surgeRetention: 0.9,
  gainScale: 100,
  basePoints: 10,
  firstInAreaBonus: 1,
  repeatDecay: 0.5,
  frictionStep: 0.2,
  warmthBonus: 1,
  warmthStep: 0.25,
  missStep: 0.2,
  dayStartHour: 4,
};
