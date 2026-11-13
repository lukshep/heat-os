import { describe, expect, it } from 'vitest';
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
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

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
function withRoutine(days: number[] = EVERY_DAY): { state: AppState; health: ID } {
  const start = createInitialState(1000, newId);
  const health = areaId(start, 'Health');
  const state = run(
    start,
    { type: 'task/add', id: 'run', at: 2000, title: 'Run', areaId: health },
    { type: 'task/makeRoutine', id: 'run', at: 2100, days, asOf: SUNDAY },
  );
  return { state, health };
}

const complete = (id: ID, dayKey: string, warmth = 0, scheduled = true): Action => ({
  type: 'routine/complete',
  id,
  at: 3000,
  dayKey,
  routineId: 'run',
  warmth,
  scheduled,
});

function routineOn(state: AppState, today: string): ListItem {
  const item = listItems(state, today, config).find((candidate) => candidate.id === 'run');
  if (!item) throw new Error('The routine is not listed');
  return item;
}

describe('making a routine', () => {
  it('turns a filed task into a routine that keeps its id', () => {
    const { state, health } = withRoutine([5, 1, 3]);
    expect(openTasks(state)).toEqual([]);
    expect(state.tasks.run?.deletedAt).toBe(2100);
    expect(routineOn(state, MONDAY)).toMatchObject({
      id: 'run',
      kind: 'routine',
      title: 'Run',
      areaId: health,
      days: [1, 3, 5],
      warmth: 0,
    });
  });

  it('keeps only real weekdays, once each', () => {
    const { state } = withRoutine([5, 1, 1, 9, -1, 2.5]);
    expect(routineOn(state, MONDAY).days).toEqual([1, 5]);
  });

  it('needs an area and at least one day', () => {
    const start = run(createInitialState(1000, newId), {
      type: 'task/add',
      id: 'loose',
      at: 2000,
      title: 'Loose',
      areaId: null,
    });
    const unfiled = run(start, { type: 'task/makeRoutine', id: 'loose', at: 2100, days: [1], asOf: SUNDAY });
    expect(unfiled).toBe(start);

    const { state } = withRoutine();
    const filed = run(state, { type: 'task/add', id: 'read', at: 2200, title: 'Read', areaId: state.routines.run!.areaId });
    expect(run(filed, { type: 'task/makeRoutine', id: 'read', at: 2300, days: [], asOf: SUNDAY })).toBe(filed);
  });

  it('lists routines ahead of tasks', () => {
    const { state, health } = withRoutine();
    const more = run(state, { type: 'task/add', id: 'stretch', at: 1500, title: 'Stretch', areaId: health });
    expect(listItems(more, MONDAY, config).map((item) => item.id)).toEqual(['run', 'stretch']);
  });
});

describe('a routine through the week', () => {
  it('is due only on its scheduled days', () => {
    const { state } = withRoutine([1]);
    expect(routineOn(state, MONDAY).dueToday).toBe(true);
    expect(routineOn(state, TUESDAY).dueToday).toBe(false);
  });

  it('is done for the day once completed, and due again the next day', () => {
    const { state, health } = withRoutine();
    const done = run(state, complete('c1', MONDAY));
    expect(routineOn(done, MONDAY).doneCompletionId).toBe('c1');
    expect(routineOn(done, TUESDAY).doneCompletionId).toBeNull();
    expect(liveCompletions(done)).toEqual([
      expect.objectContaining({ kind: 'routine', itemId: 'run', dayKey: MONDAY, areaId: health, scheduled: true }),
    ]);
  });

  it('counts once a day', () => {
    const { state } = withRoutine();
    const twice = run(state, complete('c1', MONDAY), complete('c2', MONDAY), complete('c3', TUESDAY));
    expect(liveCompletions(twice).map((completion) => completion.id)).toEqual(['c1', 'c3']);
  });

  it('can be undone', () => {
    const { state } = withRoutine();
    const undone = run(state, complete('c1', MONDAY), { type: 'completion/undo', id: 'c1', at: 3500 });
    expect(routineOn(undone, MONDAY).doneCompletionId).toBeNull();
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

  it('ignores days it is not scheduled for, done or not', () => {
    const { state } = withRoutine([1]);
    const extra = run(state, complete('c1', MONDAY), complete('c2', TUESDAY, 0.25, false));
    expect(routineOn(extra, THURSDAY).warmth).toBe(0.25);
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

  it('keeps the warmth earned so far when the schedule changes', () => {
    const { state } = withRoutine();
    const changed = run(state, complete('c1', MONDAY), complete('c2', TUESDAY), {
      type: 'routine/setDays',
      id: 'run',
      at: 5000,
      days: [1, 4],
      warmthBase: { warmth: 0.4375, missRun: 0, asOf: TUESDAY },
    });
    const item = routineOn(changed, WEDNESDAY);
    expect(item.days).toEqual([1, 4]);
    expect(item.warmth).toBeCloseTo(0.4375, 10);
    // Wednesday is no longer scheduled, so skipping it costs nothing.
    expect(routineOn(changed, THURSDAY).warmth).toBeCloseTo(0.4375, 10);
  });

  it('refuses an empty schedule', () => {
    const { state } = withRoutine();
    const same = run(state, {
      type: 'routine/setDays',
      id: 'run',
      at: 5000,
      days: [],
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
      expect.objectContaining({ areaId: health, friction: false, warmth: 0.5 }),
    ]);
    expect(listItems(later, TUESDAY, config)).toEqual([]);
  });
});

describe('going back to a one-off task', () => {
  it('returns the same task, edits included', () => {
    const { state, health } = withRoutine();
    const back = run(
      state,
      { type: 'routine/update', id: 'run', at: 4000, patch: { title: 'Morning run', friction: true } },
      { type: 'routine/makeTask', id: 'run', at: 4500 },
    );
    expect(listItems(back, MONDAY, config)).toEqual([
      expect.objectContaining({ id: 'run', kind: 'task', title: 'Morning run', friction: true, areaId: health }),
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
      { type: 'task/makeRoutine', id: 'run', at: 4600, days: EVERY_DAY, asOf: WEDNESDAY },
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

  it('rejects a routine with a damaged schedule or warmth', () => {
    const { state } = withRoutine();
    const badSchedule = JSON.parse(JSON.stringify(state));
    badSchedule.routines.run.schedule = { days: 'daily' };
    expect(parseState(badSchedule)).toBeNull();

    const badWarmth = JSON.parse(JSON.stringify(state));
    delete badWarmth.routines.run.warmthBase.asOf;
    expect(parseState(badWarmth)).toBeNull();
  });
});
