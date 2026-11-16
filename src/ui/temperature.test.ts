import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, tuned } from '../heat/config';
import { pointsFor, type DayPosition, type Scorable } from '../heat/engine';
import { TEST_CONFIG as config } from '../heat/testConfig';
import { temperatureOf } from './temperature';

const plain: Scorable = { areaId: 'work', friction: 0, warmth: 0 };
const fresh: DayPosition = { inArea: 0, areasOpened: 0 };
const deep: DayPosition = { inArea: 3, areasOpened: 2 };

function temperature(item: Scorable, position: DayPosition): number {
  return temperatureOf(pointsFor(item, position, config), config);
}

describe('temperatureOf', () => {
  it('is 1 for the most any item can earn, and never more', () => {
    // A fully warm routine with five stars, first in the day: 10 x 2 x 2 x 2.
    expect(temperatureOf(80, config)).toBeCloseTo(1, 10);
    expect(temperatureOf(500, config)).toBe(1);
    expect(temperatureOf(0, config)).toBe(0);
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
