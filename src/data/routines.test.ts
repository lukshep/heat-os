import { describe, expect, it } from 'vitest';
import type { DayKey } from '../heat/day';
import { LAST_DAY, type Schedule } from '../heat/schedule';
import { TEST_CONFIG as config } from '../heat/testConfig';
import { createInitialState, type AppState, type ID } from './model';
import { reduce, type Action } from './reducer';
import { inArea, liveAreas, liveCompletions, listItems, openTasks, type ListItem } from './selectors';
import { parseState } from './storage';

// 4 January 2026 is a Sunday.
const SUNDAY = '2026-01-04';
const MONDAY = '2026-01-05';
const TUESDAY = '2026-01-06';
const WEDNESDAY = '2026-01-07';
const THURSDAY = '2026-01-08';
const NEXT_MONDAY = '2026-01-12';
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const MON_THU = [1, 4];

const week = (days: number[]): Schedule => ({ every: 'week', days });

let counter = 0;
const newId = (): ID => `id-${++counter}`;

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reduce, state);
}

function areaId(state: AppState, name: string): ID {
  const area = liveAreas(state).find((candidate) => candidate.name === name);
  if (!area) throw new Error(`No area called ${name}`);
  return area.id;
}

/** A fresh install with one routine, "Run", in Health, made on Monday so Sunday is its base. */
function withRoutine(schedule: Schedule = week(EVERY_DAY), asOf: DayKey = SUNDAY): { state: AppState; health: ID } {
  const start = createInitialState(1000, newId);
  const health = areaId(start, 'Health');
  const state = run(
    start,
    { type: 'task/add', id: 'run', at: 2000, title: 'Run', areaId: health },
    { type: 'task/makeRoutine', id: 'run', at: 2100, schedule, asOf },
  );
  return { state, health };
}

/** Completes "Run" on `dayKey`, counting for `occurrence`: that same day unless said otherwise. */
const complete = (id: ID, dayKey: DayKey, warmth = 0, occurrence: DayKey | null = dayKey): Action => ({
  type: 'routine/complete',
  id,
  at: 3000,
  dayKey,
  routineId: 'run',
  warmth,
  occurrence,
});

function routineOn(state: AppState, today: DayKey): ListItem {
  const item = listItems(state, today, config).find((candidate) => candidate.id === 'run');
  if (!item) throw new Error('The routine is not listed');
  return item;
}

describe('making a routine', () => {
  it('turns a filed task into a routine that keeps its id', () => {
    const { state, health } = withRoutine(week([5, 1, 3]));
    expect(openTasks(state)).toEqual([]);
    expect(state.tasks.run?.deletedAt).toBe(2100);
    expect(routineOn(state, MONDAY)).toMatchObject({
      id: 'run',
      kind: 'routine',
      title: 'Run',
      areaId: health,
      repeat: week([1, 3, 5]),
      warmth: 0,
    });
  });

  it('keeps only real weekdays, once each', () => {
    const { state } = withRoutine(week([5, 1, 1, 9, -1, 2.5]));
    expect(routineOn(state, MONDAY).repeat).toEqual(week([1, 5]));
  });

  it('keeps only real days of the month, once each', () => {
    const { state } = withRoutine({ every: 'month', days: [LAST_DAY, 0, 15, 1, 15, 32, 2.5] });
    expect(routineOn(state, MONDAY).repeat).toEqual({ every: 'month', days: [1, 15, LAST_DAY] });
  });

  it('needs an area and at least one day', () => {
    const start = run(createInitialState(1000, newId), {
      type: 'task/add',
      id: 'loose',
      at: 2000,
      title: 'Loose',
      areaId: null,
    });
    const unfiled = run(start, { type: 'task/makeRoutine', id: 'loose', at: 2100, schedule: week([1]), asOf: SUNDAY });
    expect(unfiled).toBe(start);

    const { state, health } = withRoutine();
    const filed = run(state, { type: 'task/add', id: 'read', at: 2200, title: 'Read', areaId: health });
    const makeRoutine = (schedule: Schedule): Action => ({
      type: 'task/makeRoutine',
      id: 'read',
      at: 2300,
      schedule,
      asOf: SUNDAY,
    });
    expect(run(filed, makeRoutine(week([])))).toBe(filed);
    expect(run(filed, makeRoutine(week([7, 8])))).toBe(filed);
  });

  it("keeps the task's time but not its date", () => {
    const start = createInitialState(1000, newId);
    const health = areaId(start, 'Health');
    const state = run(
      start,
      { type: 'task/add', id: 'run', at: 2000, title: 'Run', areaId: health, date: MONDAY },
      { type: 'task/update', id: 'run', at: 2050, patch: { time: '07:30' } },
      { type: 'task/makeRoutine', id: 'run', at: 2100, schedule: week(EVERY_DAY), asOf: SUNDAY },
    );
    expect(state.routines.run?.time).toBe('07:30');
    expect(routineOn(state, MONDAY)).toMatchObject({ date: null, time: '07:30' });
  });

  it('lists routines ahead of tasks', () => {
    const { state, health } = withRoutine();
    const more = run(state, { type: 'task/add', id: 'stretch', at: 1500, title: 'Stretch', areaId: health });
    expect(listItems(more, MONDAY, config).map((item) => item.id)).toEqual(['run', 'stretch']);
  });
});

describe('a routine through the week', () => {
  it('is due from its date until it is done or the next date comes', () => {
    const { state } = withRoutine(week(MON_THU));
    expect(routineOn(state, MONDAY)).toMatchObject({ due: true, occurrence: MONDAY, done: false });
    // Not done on Monday: still due, and still counting for Monday, until Thursday.
    expect(routineOn(state, WEDNESDAY)).toMatchObject({ due: true, occurrence: MONDAY, done: false });
    expect(routineOn(state, THURSDAY)).toMatchObject({ due: true, occurrence: THURSDAY, done: false });
  });

  it('waits until its first date after it is made', () => {
    const { state } = withRoutine(week([4]), MONDAY);
    expect(routineOn(state, TUESDAY)).toMatchObject({ due: false, occurrence: null, done: false });
    expect(routineOn(state, THURSDAY)).toMatchObject({ due: true, occurrence: THURSDAY });
  });

  it('is done for the day once completed, and due again the next day', () => {
    const { state, health } = withRoutine();
    const done = run(state, complete('c1', MONDAY));
    expect(routineOn(done, MONDAY)).toMatchObject({ done: true, due: false, undoId: 'c1' });
    expect(routineOn(done, TUESDAY)).toMatchObject({ done: false, due: true, undoId: null });
    expect(liveCompletions(done)).toEqual([
      expect.objectContaining({ kind: 'routine', itemId: 'run', dayKey: MONDAY, areaId: health, occurrence: MONDAY }),
    ]);
  });

  it('stays done until its next date, and can be taken back only on the day it was done', () => {
    const { state } = withRoutine(week(MON_THU));
    const done = run(state, complete('c1', MONDAY));
    expect(routineOn(done, WEDNESDAY)).toMatchObject({ done: true, due: false, undoId: null });
    expect(routineOn(done, THURSDAY)).toMatchObject({ done: false, due: true });
  });

  it('counts once a day, and each date once', () => {
    const { state } = withRoutine();
    const twice = run(state, complete('c1', MONDAY), complete('c2', MONDAY), complete('c3', TUESDAY));
    expect(liveCompletions(twice).map((completion) => completion.id)).toEqual(['c1', 'c3']);

    const { state: twiceWeekly } = withRoutine(week(MON_THU));
    const late = run(twiceWeekly, complete('c1', TUESDAY, 0, MONDAY), complete('c2', WEDNESDAY, 0, MONDAY));
    expect(liveCompletions(late).map((completion) => completion.id)).toEqual(['c1']);
  });

  it('can be undone', () => {
    const { state } = withRoutine();
    const undone = run(state, complete('c1', MONDAY), { type: 'completion/undo', id: 'c1', at: 3500 });
    expect(routineOn(undone, MONDAY)).toMatchObject({ done: false, undoId: null });
    expect(liveCompletions(undone)).toEqual([]);
  });

  it('warms as it is kept and cools when it is missed', () => {
    const { state } = withRoutine();
    const kept = run(state, complete('c1', MONDAY), complete('c2', TUESDAY));
    // Today is still open, so Monday's completion only counts from Tuesday on.
    expect(routineOn(kept, MONDAY).warmth).toBe(0);
    expect(routineOn(kept, TUESDAY).warmth).toBe(0.25);
    expect(routineOn(kept, WEDNESDAY).warmth).toBeCloseTo(0.4375, 10);
    // Wednesday passes without it: a fifth of the warmth goes.
    expect(routineOn(kept, THURSDAY).warmth).toBeCloseTo(0.35, 10);
  });

  it('counts a late completion for the date it missed', () => {
    const { state } = withRoutine(week(MON_THU));
    const late = run(state, complete('c1', TUESDAY, 0, MONDAY));
    expect(routineOn(late, THURSDAY).warmth).toBe(0.25);
  });

  it('leaves warmth alone for a completion that counted for no date', () => {
    const { state } = withRoutine(week([1]));
    const extra = run(state, complete('c1', MONDAY), complete('c2', TUESDAY, 0.25, null));
    expect(routineOn(extra, NEXT_MONDAY).warmth).toBe(0.25);
  });

  it('records the warmth it was completed with, clamped to 0-1', () => {
    const { state } = withRoutine();
    const done = run(state, complete('c1', MONDAY, 0.6), complete('c2', TUESDAY, 7));
    expect(liveCompletions(done).map((completion) => completion.warmth)).toEqual([0.6, 1]);
  });
});

describe('editing a routine', () => {
  it('renames, tags and moves it, but never into the Inbox', () => {
    const { state, health } = withRoutine();
    const home = areaId(state, 'Home');
    const moved = run(state, {
      type: 'routine/update',
      id: 'run',
      at: 4000,
      patch: { title: ' Morning run ', priority: true, areaId: home },
    });
    expect(routineOn(moved, MONDAY)).toMatchObject({ title: 'Morning run', priority: true, areaId: home });

    const stuck = run(state, { type: 'routine/update', id: 'run', at: 4000, patch: { areaId: null } });
    expect(routineOn(stuck, MONDAY).areaId).toBe(health);
  });

  it('takes a time of day, but never a date', () => {
    const { state } = withRoutine();
    const update = (patch: Extract<Action, { type: 'routine/update' }>['patch']): Action => ({
      type: 'routine/update',
      id: 'run',
      at: 4000,
      patch,
    });
    const timed = run(state, update({ time: '07:30', date: MONDAY }));
    expect(routineOn(timed, MONDAY)).toMatchObject({ time: '07:30', date: null });
    expect(timed.routines.run).not.toHaveProperty('date');
    expect(run(timed, update({ time: '7:30' })).routines.run?.time).toBe('07:30');
    expect(run(timed, update({ time: null })).routines.run?.time).toBeNull();
  });

  it('keeps the warmth earned so far when the schedule changes', () => {
    const { state } = withRoutine();
    const changed = run(state, complete('c1', MONDAY), complete('c2', TUESDAY), {
      type: 'routine/setSchedule',
      id: 'run',
      at: 5000,
      schedule: week(MON_THU),
      warmthBase: { warmth: 0.4375, missRun: 0, asOf: TUESDAY },
    });
    const item = routineOn(changed, WEDNESDAY);
    expect(item.repeat).toEqual(week(MON_THU));
    expect(item.warmth).toBeCloseTo(0.4375, 10);
    // Wednesday is no longer a date, so skipping it costs nothing.
    expect(routineOn(changed, THURSDAY).warmth).toBeCloseTo(0.4375, 10);
  });

  it('can be made monthly', () => {
    const { state } = withRoutine();
    const monthly = run(state, {
      type: 'routine/setSchedule',
      id: 'run',
      at: 5000,
      schedule: { every: 'month', days: [LAST_DAY] },
      warmthBase: { warmth: 0, missRun: 0, asOf: TUESDAY },
    });
    expect(routineOn(monthly, WEDNESDAY).repeat).toEqual({ every: 'month', days: [LAST_DAY] });
    expect(routineOn(monthly, '2026-01-31')).toMatchObject({ due: true, occurrence: '2026-01-31' });
  });

  it('refuses an empty schedule', () => {
    const { state } = withRoutine();
    const same = run(state, {
      type: 'routine/setSchedule',
      id: 'run',
      at: 5000,
      schedule: week([]),
      warmthBase: { warmth: 0, missRun: 0, asOf: SUNDAY },
    });
    expect(same).toBe(state);
  });

  it('leaves past completions as they were earned', () => {
    const { state, health } = withRoutine();
    const home = areaId(state, 'Home');
    const later = run(
      state,
      complete('c1', MONDAY, 0.5),
      { type: 'routine/update', id: 'run', at: 4000, patch: { areaId: home, friction: true } },
      { type: 'routine/delete', id: 'run', at: 4500 },
    );
    expect(liveCompletions(later)).toEqual([
      expect.objectContaining({ areaId: health, friction: false, warmth: 0.5, occurrence: MONDAY }),
    ]);
    expect(listItems(later, TUESDAY, config)).toEqual([]);
  });
});

describe('going back to a one-off task', () => {
  it('returns the same task, edits included, with no date or time', () => {
    const { state, health } = withRoutine();
    const back = run(
      state,
      { type: 'routine/update', id: 'run', at: 4000, patch: { title: 'Morning run', friction: true, time: '07:30' } },
      { type: 'routine/makeTask', id: 'run', at: 4500 },
    );
    expect(listItems(back, MONDAY, config)).toEqual([
      expect.objectContaining({
        id: 'run',
        kind: 'task',
        title: 'Morning run',
        friction: true,
        areaId: health,
        date: null,
        time: null,
      }),
    ]);
    expect(back.routines.run?.deletedAt).toBe(4500);
  });

  it('starts cold if it is made a routine again', () => {
    const { state } = withRoutine();
    const again = run(
      state,
      complete('c1', MONDAY),
      complete('c2', TUESDAY),
      { type: 'routine/makeTask', id: 'run', at: 4500 },
      { type: 'task/makeRoutine', id: 'run', at: 4600, schedule: week(EVERY_DAY), asOf: WEDNESDAY },
    );
    expect(routineOn(again, THURSDAY).warmth).toBe(0);
  });

  it('happens to every routine in an area that is deleted, and they land in the Inbox', () => {
    const { state, health } = withRoutine();
    const gone = run(state, { type: 'area/delete', id: health, at: 6000 });
    const inbox = inArea(listItems(gone, MONDAY, config), null);
    expect(inbox).toEqual([expect.objectContaining({ id: 'run', kind: 'task', title: 'Run' })]);
  });
});

describe('saving routines', () => {
  it('accepts a state that holds a routine', () => {
    const { state } = withRoutine();
    const saved = JSON.parse(JSON.stringify(run(state, complete('c1', MONDAY))));
    expect(parseState(saved)).toEqual(saved);
  });

  it('accepts a monthly routine', () => {
    const { state } = withRoutine({ every: 'month', days: [1, LAST_DAY] });
    const saved = JSON.parse(JSON.stringify(state));
    expect(parseState(saved)).toEqual(saved);
  });

  it('rejects a routine with a damaged schedule, time or warmth', () => {
    const { state } = withRoutine();
    const damage = (change: (document: Record<string, any>) => void) => {
      const document = JSON.parse(JSON.stringify(state));
      change(document);
      return parseState(document);
    };
    expect(damage((d) => (d.routines.run.schedule = { days: [1] }))).toBeNull();
    expect(damage((d) => (d.routines.run.schedule = { every: 'year', days: [1] }))).toBeNull();
    expect(damage((d) => (d.routines.run.schedule = { every: 'week', days: 'daily' }))).toBeNull();
    expect(damage((d) => (d.routines.run.time = 'early'))).toBeNull();
    expect(damage((d) => delete d.routines.run.warmthBase.asOf)).toBeNull();
  });

  it('rejects a completion whose date is not a day', () => {
    const { state } = withRoutine();
    const saved = JSON.parse(JSON.stringify(run(state, complete('c1', MONDAY))));
    saved.completions.c1.occurrence = 'Monday';
    expect(parseState(saved)).toBeNull();
  });
});
