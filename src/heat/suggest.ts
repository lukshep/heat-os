import type { HeatConfig } from './config';
import { afterCompleting, gainFor, type HeatState, type Scorable } from './engine';

export interface Candidate extends Scorable {
  id: string;
  createdAt: number;
}

/**
 * Picks up to `count` items for Today, most rewarding first. Each pick is priced as if the
 * earlier picks were already done, so a second item from the same area is worth less and the
 * list spreads across areas on its own. Ties go to the older item.
 */
export function suggest<T extends Candidate>(
  candidates: readonly T[],
  state: HeatState,
  config: HeatConfig,
  count: number,
): T[] {
  const pool = [...candidates];
  const picks: T[] = [];
  let current = state;

  while (picks.length < count) {
    let best: T | undefined;
    let bestGain = Number.NEGATIVE_INFINITY;
    for (const candidate of pool) {
      const gain = gainFor(current, candidate, config);
      if (best === undefined || gain > bestGain || (gain === bestGain && isOlder(candidate, best))) {
        best = candidate;
        bestGain = gain;
      }
    }
    if (best === undefined) break;

    pool.splice(pool.indexOf(best), 1);
    picks.push(best);
    current = afterCompleting(current, best, config);
  }

  return picks;
}

function isOlder(a: Candidate, b: Candidate): boolean {
  return a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}
