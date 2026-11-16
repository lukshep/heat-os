import { describe, expect, it } from 'vitest';
import type { HeatState } from './engine';
import { suggest, type Candidate } from './suggest';
import { TEST_CONFIG as config } from './testConfig';

const state: HeatState = { heat: 40, now: 0, today: '2026-01-05', areaCounts: {} };

function candidate(id: string, areaId: string | null, overrides: Partial<Candidate> = {}): Candidate {
  return { id, areaId, friction: 0, warmth: 0, createdAt: 0, ...overrides };
}

function ids(picks: Candidate[]): string[] {
  return picks.map((pick) => pick.id);
}

describe('suggest', () => {
  it('spreads picks across areas before repeating one', () => {
    const pool = [
      candidate('w1', 'work', { createdAt: 1 }),
      candidate('w2', 'work', { createdAt: 2 }),
      candidate('w3', 'work', { createdAt: 3 }),
      candidate('h1', 'health', { createdAt: 4 }),
      candidate('m1', 'home', { createdAt: 5 }),
    ];
    expect(ids(suggest(pool, state, config, 3))).toEqual(['w1', 'h1', 'm1']);
    expect(ids(suggest(pool, state, config, 5))).toEqual(['w1', 'h1', 'm1', 'w2', 'w3']);
  });

  it('skips an area that has already been worked today', () => {
    const worked: HeatState = { ...state, areaCounts: { work: 2 } };
    const pool = [candidate('w1', 'work', { createdAt: 1 }), candidate('h1', 'health', { createdAt: 2 })];
    expect(ids(suggest(pool, worked, config, 1))).toEqual(['h1']);
  });

  it('prefers items with more Friction, and warm ones, within an area', () => {
    const pool = [
      candidate('plain', 'work', { createdAt: 1 }),
      candidate('some', 'work', { createdAt: 2, friction: 2 }),
      candidate('hard', 'work', { createdAt: 3, friction: 4 }),
    ];
    expect(ids(suggest(pool, state, config, 3))).toEqual(['hard', 'some', 'plain']);

    // First in its area, a fully warm routine doubles (40) where four stars add 80% (36).
    const routine = candidate('routine', 'work', { createdAt: 4, warmth: 1 });
    expect(ids(suggest([...pool, routine], state, config, 2))).toEqual(['routine', 'hard']);
  });

  it('puts an item with a home ahead of an unfiled one', () => {
    const pool = [candidate('loose', null, { createdAt: 1 }), candidate('filed', 'work', { createdAt: 2 })];
    expect(ids(suggest(pool, state, config, 2))).toEqual(['filed', 'loose']);
  });

  it('breaks ties by age, then by id', () => {
    const pool = [
      candidate('b', 'work', { createdAt: 5 }),
      candidate('a', 'health', { createdAt: 5 }),
      candidate('old', 'home', { createdAt: 1 }),
    ];
    expect(ids(suggest(pool, state, config, 3))).toEqual(['old', 'a', 'b']);
  });

  it('returns what there is when the pool is small, and leaves the input alone', () => {
    const pool = [candidate('only', 'work')];
    expect(suggest(pool, state, config, 5)).toHaveLength(1);
    expect(suggest([], state, config, 5)).toEqual([]);
    expect(suggest(pool, state, config, 0)).toEqual([]);
    expect(pool).toHaveLength(1);
  });
});
