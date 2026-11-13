import { FULL_HEAT, MAX_HEAT, type HeatConfig } from './config';
import { DAY_MS, type DayKey } from './day';

/** What scoring needs to know about something that could be completed. */
export interface Scorable {
  /** null for an item with no area (the Inbox). */
  areaId: string | null;
  important: boolean;
  avoided: boolean;
  /** Routine warmth from 0 to 1; 0 for tasks. */
  warmth: number;
}

/** One entry of the completion log, reduced to the facts scoring needs. */
export interface CompletionFact extends Scorable {
  id: string;
  at: number;
  dayKey: DayKey;
  itemId: string;
  kind: 'task' | 'routine';
}

/** Where a completion falls in its day. Everything that makes the same item worth less later on. */
export interface DayPosition {
  /** Completions already logged in the item's area today. */
  inArea: number;
  /** Areas that already have a completion today. */
  areasOpened: number;
}

export interface HeatState {
  heat: number;
  now: number;
  today: DayKey;
  /** Completions so far today, keyed by `areaBucket`. */
  areaCounts: Readonly<Record<string, number>>;
}

export interface ScoredCompletion {
  fact: CompletionFact;
  points: number;
  gain: number;
  heatAfter: number;
}

export interface HeatTrace {
  /** HEAT at each requested time, in the order requested. */
  samples: number[];
  /** Every completion that counted, in the order it was applied. */
  scored: ScoredCompletion[];
}

const UNASSIGNED = '';

/** The key under which an area's daily completions are counted. */
export function areaBucket(areaId: string | null): string {
  return areaId ?? UNASSIGNED;
}

/**
 * HEAT after cooling for `elapsedMs` with no activity. Above a full gauge it cools at the
 * slower Surge rate until it is back to full, then at the ordinary rate. The two meet at
 * FULL_HEAT, so the curve has no step, and nothing but HEAT's own level decides the rate.
 */
export function cool(heat: number, elapsedMs: number, config: HeatConfig): number {
  if (elapsedMs <= 0) return heat;
  let days = elapsedMs / DAY_MS;
  let level = heat;

  if (level > FULL_HEAT) {
    const slow = config.surgeRetention;
    if (slow >= 1) return level;
    const daysToFull = slow > 0 ? Math.log(FULL_HEAT / level) / Math.log(slow) : 0;
    if (days <= daysToFull) return level * Math.pow(slow, days);
    days -= daysToFull;
    level = FULL_HEAT;
  }

  return level * Math.pow(config.dailyRetention, days);
}

/**
 * Multiplier from position within the day. Each further completion in an area is worth a
 * share of the one before. The first completion in an area also earns a bonus, and that
 * bonus shrinks with every area already opened today. Items with no area earn no bonus.
 */
export function areaFactor(areaId: string | null, position: DayPosition, config: HeatConfig): number {
  const repeat = Math.pow(config.repeatDecay, position.inArea);
  if (areaId === null || position.inArea > 0) return repeat;
  return repeat + config.firstInAreaBonus * Math.pow(config.areaBonusDecay, position.areasOpened);
}

/** Multiplier from a routine's warmth: 1 for a task or a cold routine, more as it warms. */
export function warmthFactor(item: Scorable, config: HeatConfig): number {
  return 1 + config.warmthBonus * Math.min(1, Math.max(0, item.warmth));
}

/**
 * Flat points for the Important and Avoided flags. They are added after everything else,
 * so they are worth the same on the first task of the day and the tenth in an area.
 */
export function flagPoints(item: Scorable, config: HeatConfig): number {
  const share = (item.important ? config.importantBonus : 0) + (item.avoided ? config.avoidedBonus : 0);
  return config.basePoints * share;
}

/** What a completion is worth before HEAT resistance. */
export function pointsFor(item: Scorable, position: DayPosition, config: HeatConfig): number {
  const placed = config.basePoints * areaFactor(item.areaId, position, config) * warmthFactor(item, config);
  return placed + flagPoints(item, config);
}

/**
 * HEAT after earning `points`: each point closes a fraction of the remaining gap to the
 * ceiling. The ceiling is above a full gauge, so 100 can be passed, but only just.
 */
export function applyGain(heat: number, points: number, config: HeatConfig): number {
  return MAX_HEAT - (MAX_HEAT - heat) * Math.exp(-points / config.gainScale);
}

/** Where `item` would fall in a day that already holds these completions. */
function positionOf(areaCounts: Readonly<Record<string, number>>, item: Scorable): DayPosition {
  let areasOpened = 0;
  for (const bucket of Object.keys(areaCounts)) {
    if (bucket !== UNASSIGNED) areasOpened += 1;
  }
  return { inArea: areaCounts[areaBucket(item.areaId)] ?? 0, areasOpened };
}

/**
 * Sorts the log into the order it is applied and drops repeats: a task counts once,
 * a routine once per day. Two devices logging the same thing must not double the reward.
 */
function countable(completions: readonly CompletionFact[]): CompletionFact[] {
  const sorted = [...completions].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>();
  return sorted.filter((fact) => {
    const key = fact.kind === 'task' ? `task:${fact.itemId}` : `routine:${fact.itemId}:${fact.dayKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Replays the completion log and reports HEAT at each of `sampleTimes`, which must be ascending.
 * Completions later than the last sample time are not applied.
 */
export function traceHeat(
  completions: readonly CompletionFact[],
  config: HeatConfig,
  sampleTimes: readonly number[],
): HeatTrace {
  const events = countable(completions);
  const days = new Map<DayKey, Record<string, number>>();
  const scored: ScoredCompletion[] = [];
  const samples: number[] = [];
  let heat = 0;
  let heatAt = 0;
  let next = 0;
  let previous = Number.NEGATIVE_INFINITY;

  for (const time of sampleTimes) {
    if (time < previous) throw new Error('traceHeat: sample times must be ascending');
    previous = time;

    for (let event = events[next]; event !== undefined && event.at <= time; event = events[++next]) {
      let areaCounts = days.get(event.dayKey);
      if (!areaCounts) {
        areaCounts = {};
        days.set(event.dayKey, areaCounts);
      }

      const before = cool(heat, event.at - heatAt, config);
      const points = pointsFor(event, positionOf(areaCounts, event), config);
      heat = applyGain(before, points, config);
      heatAt = event.at;
      scored.push({ fact: event, points, gain: heat - before, heatAfter: heat });

      const bucket = areaBucket(event.areaId);
      areaCounts[bucket] = (areaCounts[bucket] ?? 0) + 1;
    }

    samples.push(cool(heat, time - heatAt, config));
  }

  return { samples, scored };
}

/** HEAT right now, plus what is needed to price the next completion. */
export function foldHeat(
  completions: readonly CompletionFact[],
  config: HeatConfig,
  now: number,
  today: DayKey,
): HeatState {
  const { samples, scored } = traceHeat(completions, config, [now]);
  const areaCounts: Record<string, number> = {};
  for (const { fact } of scored) {
    if (fact.dayKey !== today) continue;
    const bucket = areaBucket(fact.areaId);
    areaCounts[bucket] = (areaCounts[bucket] ?? 0) + 1;
  }
  return { heat: samples[0] ?? 0, now, today, areaCounts };
}

/** HEAT the item would add if completed right now. This is what an item's colour shows. */
export function gainFor(state: HeatState, item: Scorable, config: HeatConfig): number {
  const points = pointsFor(item, positionOf(state.areaCounts, item), config);
  return applyGain(state.heat, points, config) - state.heat;
}

/** The state that would result from completing the item right now. */
export function afterCompleting(state: HeatState, item: Scorable, config: HeatConfig): HeatState {
  const position = positionOf(state.areaCounts, item);
  return {
    ...state,
    heat: applyGain(state.heat, pointsFor(item, position, config), config),
    areaCounts: { ...state.areaCounts, [areaBucket(item.areaId)]: position.inArea + 1 },
  };
}
