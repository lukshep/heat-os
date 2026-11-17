import { describe, expect, it } from 'vitest';
import type { Schedule } from '../heat/schedule';
import { TEST_CONFIG } from '../heat/testConfig';
import { createInitialState, type AppState } from './model';
import { reduce, type Action } from './reducer';
import {
  dayList,
  hasPlans,
  listItems,
  liveAreas,
  minutesIntoDay,
  planToday,
  priorityFirst,
  type ListItem,
} from './selectors';

const TODAY = '2026-11-15';
const DAY_START = 4;

let created = 0;

/** A list row with plain defaults: an undated, untimed task. */
function row(id: string, overrides: Partial<ListItem> = {}): ListItem {
  return {
    id,
    kind: 'task',
    title: id,
    description: '',
    subtasks: [],
    areaId: 'work',
    projectId: null,
    priority: false,
    friction: 0,
    createdAt: ++created,
    date: null,
    time: null,
    repeat: null,
    warmth: 0,
    due: false,
    occurrence: null,
    done: false,
    undoId: null,
    ...overrides,
  };
}

const routine = (id: string, overrides: Partial<ListItem> = {}): ListItem =>
  row(id, { kind: 'routine', repeat: { every: 'week', days: [0] }, due: true, occurrence: TODAY, ...overrides });

const ids = (items: readonly ListItem[]) => items.map((item) => item.id);

describe('minutesIntoDay', () => {
  it('counts from the start of the day', () => {
    expect(minutesIntoDay('04:00', DAY_START)).toBe(0);
    expect(minutesIntoDay('09:30', DAY_START)).toBe(330);
  });

  it('puts a time before the day starts at the end, as part of that night', () => {
    expect(minutesIntoDay('01:30', DAY_START)).toBeGreaterThan(minutesIntoDay('23:59', DAY_START));
    expect(minutesIntoDay('00:00', 0)).toBe(0);
  });
});

describe('planToday', () => {
  it('lists timed items first in time order, then due routines, then planned tasks', () => {
    const items = [
      routine('meds', { time: '20:00' }),
      routine('run'),
      row('call', { date: TODAY, time: '09:30' }),
      row('pay', { date: TODAY }),
      row('night', { date: TODAY, time: '01:00' }),
    ];
    expect(ids(planToday(items, TODAY, DAY_START).settled)).toEqual(['call', 'meds', 'night', 'run', 'pay']);
  });

  it('keeps tasks planned for an earlier day, earliest first', () => {
    const items = [
      row('today', { date: TODAY }),
      row('friday', { date: '2026-11-13' }),
      row('sunday', { date: '2026-11-08' }),
    ];
    expect(ids(planToday(items, TODAY, DAY_START).settled)).toEqual(['sunday', 'friday', 'today']);
  });

  it('leaves out routines that are not due and tasks planned for a later day', () => {
    const items = [
      routine('done', { due: false, done: true }),
      routine('early', { due: false, occurrence: '2026-11-20' }),
      row('later', { date: '2026-11-16' }),
    ];
    const plan = planToday(items, TODAY, DAY_START);
    expect(plan.settled).toEqual([]);
    expect(plan.undated).toEqual([]);
  });

  it('offers only undated tasks for suggestions, and counts the planned ones', () => {
    const items = [routine('run'), row('pay', { date: TODAY }), row('old', { date: '2026-11-10' }), row('loose')];
    const plan = planToday(items, TODAY, DAY_START);
    expect(plan.plannedTasks).toBe(2);
    expect(ids(plan.undated)).toEqual(['loose']);
  });

  it('puts Priority first, timed items included, keeping the usual order on each side', () => {
    const items = [
      routine('meds', { time: '20:00' }),
      routine('run', { priority: true }),
      row('call', { date: TODAY, time: '09:30' }),
      row('pay', { date: TODAY, priority: true }),
      row('dentist', { date: TODAY, time: '11:00', priority: true }),
    ];
    expect(ids(planToday(items, TODAY, DAY_START).settled)).toEqual(['dentist', 'run', 'pay', 'call', 'meds']);
  });

  it('always has a Priority task with no date on it, rather than offering it as a suggestion', () => {
    const items = [row('loose'), row('urgent', { priority: true }), row('pay', { date: TODAY })];
    const plan = planToday(items, TODAY, DAY_START);
    expect(ids(plan.settled)).toEqual(['urgent', 'pay']);
    expect(plan.plannedTasks).toBe(2);
    expect(ids(plan.undated)).toEqual(['loose']);
  });

  it('leaves a Priority task planned for a later day on its day', () => {
    const plan = planToday([row('later', { date: '2026-11-16', priority: true })], TODAY, DAY_START);
    expect(plan.settled).toEqual([]);
    expect(plan.undated).toEqual([]);
  });
});

describe('priorityFirst', () => {
  it('moves Priority to the top and keeps the order on each side', () => {
    const items = [row('a'), row('b', { priority: true }), row('c'), row('d', { priority: true })];
    expect(ids(priorityFirst(items))).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('a later day', () => {
  const FRIDAY = '2026-11-20';
  const YESTERDAY = '2026-11-14';
  let areaIds = 0;

  /**
   * Home holds two tasks planned for Friday, one with a time, a task for Saturday and one with
   * no date, plus three routines: rent on the 20th of each month, a daily run, and the bins
   * every Friday. Each was made yesterday.
   */
  function week(): AppState {
    const start = createInitialState(1000, () => `area-${++areaIds}`);
    const home = liveAreas(start).find((area) => area.name === 'Home')!.id;
    let at = 2000;
    const add = (id: string, date: string | null = null): Action => ({
      type: 'task/add',
      id,
      at: ++at,
      title: id,
      areaId: home,
      date,
    });
    const repeat = (id: string, schedule: Schedule): Action[] => [
      add(id),
      { type: 'task/makeRoutine', id, at: ++at, schedule, asOf: YESTERDAY },
    ];
    const actions: Action[] = [
      ...repeat('rent', { every: 'month', days: [20] }),
      ...repeat('run', { every: 'week', days: [0, 1, 2, 3, 4, 5, 6] }),
      ...repeat('bins', { every: 'week', days: [5] }),
      add('pay', FRIDAY),
      add('call', FRIDAY),
      { type: 'task/update', id: 'call', at: ++at, patch: { time: '09:00' } },
      add('later', '2026-11-21'),
      add('loose'),
    ];
    return actions.reduce(reduce, start);
  }

  const items = (state: AppState) => listItems(state, TODAY, TEST_CONFIG);
  const friday = (state: AppState) => dayList(state, items(state), FRIDAY, DAY_START);
  const rowOf = (rows: readonly ListItem[], id: string) => rows.find((row) => row.id === id);

  it('holds the tasks planned for it and the routines due on it, timed first', () => {
    expect(ids(friday(week()))).toEqual(['call', 'rent', 'run', 'bins', 'pay']);
  });

  it('puts Priority first on a later day too', () => {
    const state = reduce(week(), { type: 'task/update', id: 'pay', at: 9000, patch: { priority: true } });
    expect(ids(friday(state))).toEqual(['pay', 'call', 'rent', 'run', 'bins']);
  });

  it('can be done ahead only where a monthly date has opened early', () => {
    const rows = friday(week());
    expect(rowOf(rows, 'rent')).toMatchObject({ occurrence: FRIDAY, done: false, due: false });
    expect(rowOf(rows, 'run')).toMatchObject({ occurrence: null, done: false });
    expect(rowOf(rows, 'bins')).toMatchObject({ occurrence: null, done: false });
  });

  it("shows a date done early as done, and takes back only today's completion for that date", () => {
    const routine = (id: string, completion: string, occurrence: string): Action => ({
      type: 'routine/complete',
      id: completion,
      at: 9000,
      dayKey: TODAY,
      routineId: id,
      warmth: 0,
      occurrence,
    });
    const completions: Action[] = [routine('rent', 'c1', FRIDAY), routine('run', 'c2', TODAY)];
    const state = completions.reduce(reduce, week());
    const rows = friday(state);
    expect(rowOf(rows, 'rent')).toMatchObject({ done: true, undoId: 'c1', occurrence: null });
    expect(rowOf(rows, 'run')).toMatchObject({ done: false, undoId: null });
  });

  it('marks days with a planned task or a monthly routine, and not a weekly rhythm', () => {
    const all = items(week());
    expect(hasPlans(all, FRIDAY)).toBe(true);
    expect(hasPlans(all, '2026-11-21')).toBe(true);
    expect(hasPlans(all, '2026-11-19')).toBe(false);
    expect(hasPlans(all, '2026-12-20')).toBe(true);
    expect(hasPlans(all, '2026-12-18')).toBe(false);
  });
});
