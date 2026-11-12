import { MAX_HEAT, type HeatConfig } from './config';
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
  /** Flagged completions already logged today. */
  flagged: number;
}

export interface HeatState {
  heat: number;
  now: number;
  today: DayKey;
  /** Completions so far today, keyed by `areaBucket`. */
  areaCounts: Readonly<Record<string, number>>;
  /** Important or Avoided completions so far today. */
  flaggedToday: number;
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

export function isFlagged(item: Scorable): boolean {
  return item.important || item.avoided;
}

/** HEAT after cooling for `elapsedMs` with no activity. */
export function cool(heat: number, elapsedMs: number, config: HeatConfig): number {
  if (elapsedMs <= 0) return heat;
  return heat * Math.pow(config.dailyRetention, elapsedMs / DAY_MS);
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

/**
 * Multiplier from the item itself. Flags and routine warmth add, they do not compound,
 * and the flag bonus shrinks with every flagged completion already logged today.
 */
export function quality(item: Scorable, position: DayPosition, config: HeatConfig): number {
  const warmth = Math.min(1, Math.max(0, item.warmth));
  const flags = (item.important ? config.importantBonus : 0) + (item.avoided ? config.avoidedBonus : 0);
  return 1 + flags * Math.pow(config.flagDecay, position.flagged) + config.warmthBonus * warmth;
}

/** What a completion is worth before HEAT resistance. */
export function pointsFor(item: Scorable, position: DayPosition, config: HeatConfig): number {
  return config.basePoints * areaFactor(item.areaId, position, config) * quality(item, position, config);
}

/** HEAT after earning `points`: each point closes a fraction of the remaining gap to the maximum. */
export function applyGain(heat: number, points: number, config: HeatConfig): number {
  return MAX_HEAT - (MAX_HEAT - heat) * Math.exp(-points / config.gainScale);
}

/** Where `item` would fall in a day that already holds these completions. */
function positionOf(areaCounts: Readonly<Record<string, number>>, flagged: number, item: Scorable): DayPosition {
  let areasOpened = 0;
  for (const bucket of Object.keys(areaCounts)) {
    if (bucket !== UNASSIGNED) areasOpened += 1;
  }
  return { inArea: areaCounts[areaBucket(item.areaId)] ?? 0, areasOpened, flagged };
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
  const days = new Map<DayKey, { areaCounts: Record<string, number>; flagged: number }>();
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
      let day = days.get(event.dayKey);
      if (!day) {
        day = { areaCounts: {}, flagged: 0 };
        days.set(event.dayKey, day);
      }

      const before = cool(heat, event.at - heatAt, config);
      const points = pointsFor(event, positionOf(day.areaCounts, day.flagged, event), config);
      heat = applyGain(before, points, config);
      heatAt = event.at;
      scored.push({ fact: event, points, gain: heat - before, heatAfter: heat });

      const bucket = areaBucket(event.areaId);
      day.areaCounts[bucket] = (day.areaCounts[bucket] ?? 0) + 1;
      if (isFlagged(event)) day.flagged += 1;
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
  let flaggedToday = 0;
  for (const { fact } of scored) {
    if (fact.dayKey !== today) continue;
    const bucket = areaBucket(fact.areaId);
    areaCounts[bucket] = (areaCounts[bucket] ?? 0) + 1;
    if (isFlagged(fact)) flaggedToday += 1;
  }
  return { heat: samples[0] ?? 0, now, today, areaCounts, flaggedToday };
}

/** HEAT the item would add if completed right now. This is what an item's colour shows. */
export function gainFor(state: HeatState, item: Scorable, config: HeatConfig): number {
  const points = pointsFor(item, positionOf(state.areaCounts, state.flaggedToday, item), config);
  return applyGain(state.heat, points, config) - state.heat;
}

/** The state that would result from completing the item right now. */
export function afterCompleting(state: HeatState, item: Scorable, config: HeatConfig): HeatState {
  const position = positionOf(state.areaCounts, state.flaggedToday, item);
  return {
    ...state,
    heat: applyGain(state.heat, pointsFor(item, position, config), config),
    areaCounts: { ...state.areaCounts, [areaBucket(item.areaId)]: position.inArea + 1 },
    flaggedToday: state.flaggedToday + (isFlagged(item) ? 1 : 0),
  };
}
