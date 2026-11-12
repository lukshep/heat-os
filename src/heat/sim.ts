import type { HeatConfig } from './config';
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
  /** How many of the day's tasks are Important and Avoided; the earliest tasks get the flags. */
  important: number;
  avoided: number;
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
  /** Share of the days in that final cycle on which HEAT reached the threshold at some point. */
  daysAtLine: number;
  /** When HEAT first reaches the threshold, in days from the start; null if it never does. */
  reachesLineOnDay: number | null;
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
            important: false,
            avoided: false,
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
          important: task < scenario.important,
          avoided: task < scenario.avoided,
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
  const dayPeaks = new Array<number>(totalDays).fill(0);
  let settledPeak = 0;
  let settledLow = Number.POSITIVE_INFINITY;
  let reachesLineOnDay: number | null = null;

  for (const sample of samples) {
    if (reachesLineOnDay === null && sample.heat >= config.threshold) reachesLineOnDay = sample.day;
    const day = Math.floor(sample.day);
    if (day < totalDays) dayPeaks[day] = Math.max(dayPeaks[day] ?? 0, sample.heat);
    if (sample.day < settledFrom) continue;
    settledPeak = Math.max(settledPeak, sample.heat);
    settledLow = Math.min(settledLow, sample.heat);
  }

  const settledDays = dayPeaks.slice(settledFrom);
  const daysAtLine = settledDays.filter((peak) => peak >= config.threshold).length;
  const points = trace.scored.reduce((sum, entry) => sum + entry.points, 0);

  return {
    samples,
    scored: trace.scored,
    stats: {
      settledPeak,
      settledLow: Number.isFinite(settledLow) ? settledLow : 0,
      daysAtLine: settledDays.length > 0 ? daysAtLine / settledDays.length : 0,
      reachesLineOnDay,
      pointsPerActiveDay: run.activeDays > 0 ? points / run.activeDays : 0,
      routineWarmth: run.routineWarmth,
    },
  };
}

const EVERY_DAY_ON = { daysOn: 1, daysOff: 0 };
const NO_FLAGS = { important: 0, avoided: 0 };
const NO_ROUTINES = { routines: 0, skipRoutinesEvery: 0 };
const ONE_SITTING = { fromHour: 18, toHour: 18 };
const THROUGH_THE_DAY = { fromHour: 8, toHour: 20 };

/** Behaviours worth checking after every change to the numbers. */
export const SCENARIOS: readonly [Scenario, ...Scenario[]] = [
  {
    name: 'Maintenance day',
    note: 'Two tasks in each of four areas, every day. This should just reach the line.',
    ...EVERY_DAY_ON, areas: 4, tasks: 8, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Three areas, three tasks each',
    note: 'Nine tasks across three areas, every day. Fewer areas, more depth: also just reaches the line.',
    ...EVERY_DAY_ON, areas: 3, tasks: 9, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Big day',
    note: 'Three tasks in each of four areas, one Important, every day. Comfortably over the line.',
    ...EVERY_DAY_ON, areas: 4, tasks: 12, important: 1, avoided: 0, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Light day',
    note: 'Two tasks in each of three areas, every day. A real day, but short of the line.',
    ...EVERY_DAY_ON, areas: 3, tasks: 6, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'One task per area',
    note: 'One task in each of five areas, every day. Breadth alone should fall short.',
    ...EVERY_DAY_ON, areas: 5, tasks: 5, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Breadth farmer',
    note: 'One trivial task in each of six areas, every day. The cheapest way to score: how close does it get?',
    ...EVERY_DAY_ON, areas: 6, tasks: 6, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'One-area grind',
    note: 'Five tasks a day, all in one area. Volume without balance should stay well under the line.',
    ...EVERY_DAY_ON, areas: 1, tasks: 5, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Task splitter',
    note: 'Twenty tiny tasks a day in one area. Splitting work must not beat the one-area ceiling.',
    ...EVERY_DAY_ON, areas: 1, tasks: 20, ...NO_FLAGS, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Flag everything',
    note: 'The maintenance day with every task marked Important and Avoided. Shows what flag inflation buys.',
    ...EVERY_DAY_ON, areas: 4, tasks: 8, important: 8, avoided: 8, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Weekend warrior',
    note: 'Two big days, then five days of nothing. Bursts should not stand in for consistency.',
    daysOn: 2, daysOff: 5, areas: 4, tasks: 12, important: 1, avoided: 0, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Week off',
    note: 'Two weeks of big days, then a week away. Watch how long HEAT takes to come back.',
    daysOn: 14, daysOff: 7, areas: 4, tasks: 12, important: 1, avoided: 0, ...NO_ROUTINES, ...ONE_SITTING,
  },
  {
    name: 'Routines, kept',
    note: 'Three daily routines plus three tasks. Under the line while the routines are new, over it once they are warm.',
    ...EVERY_DAY_ON, areas: 3, tasks: 3, ...NO_FLAGS, routines: 3, skipRoutinesEvery: 0, ...THROUGH_THE_DAY,
  },
  {
    name: 'Routines, patchy',
    note: 'The same, but the routines are skipped every third day. The lost warmth should keep it under the line.',
    ...EVERY_DAY_ON, areas: 3, tasks: 3, ...NO_FLAGS, routines: 3, skipRoutinesEvery: 3, ...THROUGH_THE_DAY,
  },
];
