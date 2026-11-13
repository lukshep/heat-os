import { FULL_HEAT, type HeatConfig } from './config';
import { addDays, dayKeyAt, DAY_MS, HOUR_MS, type DayKey } from './day';
import { traceHeat, type CompletionFact, type ScoredCompletion } from './engine';
import { warmthAt, type Schedule, type WarmthBase } from './warmth';

/** A repeating pattern of behaviour to play through the engine. */
export interface Scenario {
  name: string;
  note: string;
  /** Active days, then rest days, repeating. */
  daysOn: number;
  daysOff: number;
  /** Areas touched on an active day. */
  areas: number;
  /** Tasks completed on an active day, dealt round-robin across the areas. */
  tasks: number;
  /** How many of the day's tasks are tagged Priority and Friction; the earliest tasks get the tags. */
  priority: number;
  friction: number;
  /** Daily routines, dealt across the areas and done before any task on an active day. */
  routines: number;
  /** Skip the routines on every Nth active day. 0 never skips. */
  skipRoutinesEvery: number;
  /** Local hours between which the day's completions are spread. Equal values mean one sitting. */
  fromHour: number;
  toHour: number;
}

export interface SimSample {
  /** Days since the start of the run. */
  day: number;
  heat: number;
}

export interface SimStats {
  /** Highest and lowest HEAT across the final full on/off cycle. */
  settledPeak: number;
  settledLow: number;
  /** Share of that final cycle spent in Surge, above a full gauge. */
  surgeShare: number;
  pointsPerActiveDay: number;
  /** Warmth of the first routine at the end of the run; null when the scenario has none. */
  routineWarmth: number | null;
}

export interface SimResult {
  samples: SimSample[];
  scored: ScoredCompletion[];
  stats: SimStats;
}

/** A Monday, so day 0 of every run is the same weekday. The simulated clock is UTC. */
const START_DAY: DayKey = '2026-01-05';
const START_MS = Date.UTC(2026, 0, 5);
const EVERY_DAY: Schedule = { days: [0, 1, 2, 3, 4, 5, 6] };

function wholeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Days since the start of the run for a simulated instant. */
export function simDayOf(at: number): number {
  return (at - START_MS) / DAY_MS;
}

export function isActiveDay(scenario: Scenario, day: number): boolean {
  const on = wholeNumber(scenario.daysOn);
  const cycle = on + wholeNumber(scenario.daysOff);
  return cycle > 0 && day % cycle < on;
}

interface Run {
  facts: CompletionFact[];
  activeDays: number;
  routineWarmth: number | null;
}

/** Turns a scenario into the completion log a person behaving that way would produce. */
export function buildRun(scenario: Scenario, config: HeatConfig, days: number): Run {
  const areas = Math.max(1, wholeNumber(scenario.areas));
  const tasks = wholeNumber(scenario.tasks);
  const skipEvery = wholeNumber(scenario.skipRoutinesEvery);
  const fromHour = Math.max(scenario.fromHour, config.dayStartHour);
  const toHour = Math.max(fromHour, scenario.toHour);

  const routines = Array.from({ length: wholeNumber(scenario.routines) }, (_, index) => ({
    itemId: `routine-${index}`,
    areaId: `area-${index % areas}`,
    base: { warmth: 0, missRun: 0, asOf: addDays(START_DAY, -1) } as WarmthBase,
    done: new Set<DayKey>(),
  }));

  const facts: CompletionFact[] = [];
  let activeDays = 0;

  for (let day = 0; day < wholeNumber(days); day++) {
    const today = addDays(START_DAY, day);

    if (isActiveDay(scenario, day)) {
      activeDays += 1;
      const planned: Omit<CompletionFact, 'id' | 'at' | 'dayKey'>[] = [];

      if (skipEvery === 0 || activeDays % skipEvery !== 0) {
        for (const routine of routines) {
          const { warmth } = warmthAt(routine.base, EVERY_DAY, routine.done, today, config);
          planned.push({
            itemId: routine.itemId,
            kind: 'routine',
            areaId: routine.areaId,
            priority: false,
            friction: false,
            warmth,
          });
          routine.done.add(today);
        }
      }

      for (let task = 0; task < tasks; task++) {
        planned.push({
          itemId: `task-${day}-${task}`,
          kind: 'task',
          areaId: `area-${task % areas}`,
          priority: task < scenario.priority,
          friction: task < scenario.friction,
          warmth: 0,
        });
      }

      planned.forEach((item, index) => {
        const share = planned.length > 1 ? index / (planned.length - 1) : 0;
        const at = START_MS + day * DAY_MS + (fromHour + (toHour - fromHour) * share) * HOUR_MS;
        facts.push({
          ...item,
          id: `${pad(day, 5)}-${pad(index, 5)}`,
          at,
          dayKey: dayKeyAt(at, config.dayStartHour, 0),
        });
      });
    }

    // Settle today for every routine, so tomorrow starts from the right warmth.
    for (const routine of routines) {
      const settled = warmthAt(routine.base, EVERY_DAY, routine.done, addDays(today, 1), config);
      routine.base = { ...settled, asOf: today };
    }
  }

  return { facts, activeDays, routineWarmth: routines[0]?.base.warmth ?? null };
}

/** Plays a scenario through the same replay the app uses and summarises where HEAT settles. */
export function simulate(scenario: Scenario, config: HeatConfig, days: number): SimResult {
  const totalDays = wholeNumber(days);
  const run = buildRun(scenario, config, totalDays);
  const end = START_MS + totalDays * DAY_MS;

  // Hourly samples draw the cooling curve; a sample just before and at each completion
  // keeps the jumps vertical and makes peaks and lows exact.
  const times = new Set<number>();
  for (let time = START_MS; time <= end; time += HOUR_MS) times.add(time);
  for (const fact of run.facts) {
    times.add(fact.at - 1);
    times.add(fact.at);
  }
  const sampleTimes = [...times].filter((time) => time >= START_MS && time <= end).sort((a, b) => a - b);

  const trace = traceHeat(run.facts, config, sampleTimes);
  const samples = sampleTimes.map((time, index) => ({
    day: simDayOf(time),
    heat: trace.samples[index] ?? 0,
  }));

  const cycle = Math.max(1, wholeNumber(scenario.daysOn) + wholeNumber(scenario.daysOff));
  const settledFrom = Math.max(0, totalDays - cycle);
  let settledPeak = 0;
  let settledLow = Number.POSITIVE_INFINITY;
  let surgeDays = 0;

  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    if (!sample || sample.day < settledFrom) continue;
    settledPeak = Math.max(settledPeak, sample.heat);
    settledLow = Math.min(settledLow, sample.heat);
    const following = samples[index + 1];
    if (following) surgeDays += daysInSurge(sample.heat, following.day - sample.day, config);
  }

  const points = trace.scored.reduce((sum, entry) => sum + entry.points, 0);
  const settledDays = totalDays - settledFrom;

  return {
    samples,
    scored: trace.scored,
    stats: {
      settledPeak,
      settledLow: Number.isFinite(settledLow) ? settledLow : 0,
      surgeShare: settledDays > 0 ? surgeDays / settledDays : 0,
      pointsPerActiveDay: run.activeDays > 0 ? points / run.activeDays : 0,
      routineWarmth: run.routineWarmth,
    },
  };
}

/** Days out of `spanDays` spent above a full gauge while cooling from `heat` with no activity. */
function daysInSurge(heat: number, spanDays: number, config: HeatConfig): number {
  if (heat <= FULL_HEAT) return 0;
  if (config.surgeRetention >= 1) return spanDays;
  if (config.surgeRetention <= 0) return 0;
  return Math.min(spanDays, Math.log(FULL_HEAT / heat) / Math.log(config.surgeRetention));
}

const EVERY_DAY_ON = { daysOn: 1, daysOff: 0 };
const NO_TAGS = { priority: 0, friction: 0 };
const NO_ROUTINES = { routines: 0, skipRoutinesEvery: 0 };
const ONE_SITTING = { fromHour: 18, toHour: 18 };
const THROUGH_THE_DAY = { fromHour: 8, toHour: 20 };

/** Behaviours worth checking after every change to the numbers. */
export const SCENARIOS: readonly [Scenario, ...Scenario[]] = [
  {
    name: 'Balanced day',
    note: 'Two tasks in each of four areas, every day. Consistent, balanced activity should sit at about 70 to 85.',
    ...EVERY_DAY_ON, areas: 4, tasks: 8, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Balanced day, one task tagged',
    note: 'The balanced day with its first task tagged Priority and Friction. Tags lift it a little.',
    ...EVERY_DAY_ON, areas: 4, tasks: 8, priority: 1, friction: 1, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Light day',
    note: 'Two tasks in each of three areas, every day. Lower than a balanced day, but not punished.',
    ...EVERY_DAY_ON, areas: 3, tasks: 6, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Big day',
    note: 'Three tasks in each of four areas, the first tagged with both, every day. High, but still short of a full gauge.',
    ...EVERY_DAY_ON, areas: 4, tasks: 12, priority: 1, friction: 1, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Huge day',
    note: 'Three daily routines plus twelve tasks, the first two tagged with both, every day. This is what Surge takes.',
    ...EVERY_DAY_ON, areas: 4, tasks: 12, priority: 2, friction: 2, routines: 3, skipRoutinesEvery: 0, ...ONE_SITTING,
  },
  {
    name: 'One task per area',
    note: 'One task in each of five areas, every day. Breadth with no depth.',
    ...EVERY_DAY_ON, areas: 5, tasks: 5, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'One-area grind',
    note: 'Five tasks a day, all in one area. Volume without balance should sit well below a balanced day.',
    ...EVERY_DAY_ON, areas: 1, tasks: 5, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Task splitter',
    note: 'Twenty tiny tasks a day in one area. Splitting work must not beat the one-area ceiling.',
    ...EVERY_DAY_ON, areas: 1, tasks: 20, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Tag everything',
    note: 'The balanced day with every task tagged Priority and Friction. Tags are a share of the reward, so this stays short of Surge.',
    ...EVERY_DAY_ON, areas: 4, tasks: 8, priority: 8, friction: 8, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Weekend warrior',
    note: 'Two big days, then five days of nothing. Bursts should not stand in for consistency.',
    daysOn: 2, daysOff: 5, areas: 4, tasks: 12, priority: 1, friction: 1, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Week off',
    note: 'Two weeks of balanced days, then a week away. Watch how far HEAT falls and how fast it comes back.',
    daysOn: 14, daysOff: 7, areas: 4, tasks: 8, ...NO_TAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Routines, kept',
    note: 'Three daily routines plus three tasks. The same effort is worth more as the routines warm.',
    ...EVERY_DAY_ON, areas: 3, tasks: 3, ...NO_TAGS, routines: 3, skipRoutinesEvery: 0, ...THROUGH_THE_DAY,
  },
  {
    name: 'Routines, patchy',
    note: 'The same, but the routines are skipped every third day. Lost warmth and lost days pull it down.',
    ...EVERY_DAY_ON, areas: 3, tasks: 3, ...NO_TAGS, routines: 3, skipRoutinesEvery: 3, ...THROUGH_THE_DAY,
  },
];
