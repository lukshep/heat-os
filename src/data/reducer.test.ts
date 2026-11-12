import { describe, expect, it } from 'vitest';
import { createInitialState, SEED_AREA_NAMES, type AppState, type ID } from './model';
import { reduce, type Action } from './reducer';
import { deferredToday, liveAreas, liveCompletions, openTasks, tasksIn } from './selectors';

const DAY_1 = '2026-01-05';
const DAY_2 = '2026-01-06';

let counter = 0;
const newId = (): ID => `id-${++counter}`;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** A fresh install, frozen so any mutation by the reducer throws. */
function fresh(): AppState {
  return deepFreeze(createInitialState(1000, newId));
}

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce((current, action) => deepFreeze(reduce(current, action)), state);
}

function areaId(state: AppState, name: string): ID {
  const area = liveAreas(state).find((candidate) => candidate.name === name);
  if (!area) throw new Error(`No area called ${name}`);
  return area.id;
}

const addTask = (id: ID, title: string, area: ID | null = null, at = 2000): Action => ({
  type: 'task/add',
  id,
  at,
  title,
  areaId: area,
});

const complete = (id: ID, taskId: ID, at = 3000, dayKey = DAY_1): Action => ({
  type: 'task/complete',
  id,
  at,
  dayKey,
  taskId,
});

describe('a new install', () => {
  it('starts with the seed areas in order and nothing else', () => {
    const state = fresh();
    expect(liveAreas(state).map((area) => area.name)).toEqual(SEED_AREA_NAMES);
    expect(openTasks(state)).toEqual([]);
    expect(liveCompletions(state)).toEqual([]);
  });
});

describe('tasks', () => {
  it('captures into the Inbox by default', () => {
    const state = run(fresh(), addTask('t1', '  Call the dentist  '));
    const [task] = openTasks(state);
    expect(task?.title).toBe('Call the dentist');
    expect(task?.areaId).toBeNull();
    expect(tasksIn(openTasks(state), null)).toHaveLength(1);
  });

  it('ignores a blank title', () => {
    expect(openTasks(run(fresh(), addTask('t1', '   ')))).toEqual([]);
  });

  it('files straight into an area when given one, and into the Inbox when the area is unknown', () => {
    const start = fresh();
    const work = areaId(start, 'Work');
    const state = run(start, addTask('t1', 'Write report', work), addTask('t2', 'Stray', 'no-such-area'));
    expect(tasksIn(openTasks(state), work).map((task) => task.id)).toEqual(['t1']);
    expect(tasksIn(openTasks(state), null).map((task) => task.id)).toEqual(['t2']);
  });

  it('lists open tasks oldest first', () => {
    const state = run(fresh(), addTask('new', 'Newer', null, 5000), addTask('old', 'Older', null, 4000));
    expect(openTasks(state).map((task) => task.id)).toEqual(['old', 'new']);
  });

  it('renames, flags and moves a task', () => {
    const start = fresh();
    const home = areaId(start, 'Home');
    const state = run(start, addTask('t1', 'Fix tap'), {
      type: 'task/update',
      id: 't1',
      at: 2500,
      patch: { title: ' Fix the tap ', important: true, avoided: true, areaId: home },
    });
    expect(state.tasks.t1).toMatchObject({
      title: 'Fix the tap',
      important: true,
      avoided: true,
      areaId: home,
      updatedAt: 2500,
    });
  });

  it('keeps the old title when the new one is blank, and the old area when the new one is unknown', () => {
    const state = run(fresh(), addTask('t1', 'Fix tap'), {
      type: 'task/update',
      id: 't1',
      at: 2500,
      patch: { title: '  ', areaId: 'no-such-area' },
    });
    expect(state.tasks.t1).toMatchObject({ title: 'Fix tap', areaId: null });
  });

  it('hides a deleted task but keeps the record', () => {
    const state = run(fresh(), addTask('t1', 'Fix tap'), { type: 'task/delete', id: 't1', at: 2500 });
    expect(openTasks(state)).toEqual([]);
    expect(state.tasks.t1?.deletedAt).toBe(2500);
  });
});

describe('completing', () => {
  it('logs the facts and takes the task off the open list', () => {
    const start = fresh();
    const health = areaId(start, 'Health');
    const state = run(
      start,
      addTask('t1', 'Run', health),
      { type: 'task/update', id: 't1', at: 2500, patch: { important: true } },
      complete('c1', 't1'),
    );
    expect(openTasks(state)).toEqual([]);
    expect(liveCompletions(state)).toEqual([
      expect.objectContaining({
        id: 'c1',
        at: 3000,
        dayKey: DAY_1,
        itemId: 't1',
        kind: 'task',
        areaId: health,
        important: true,
        avoided: false,
        warmth: 0,
      }),
    ]);
  });

  it('counts a task once however many times it is completed', () => {
    const state = run(fresh(), addTask('t1', 'Run'), complete('c1', 't1'), complete('c2', 't1', 3500));
    expect(liveCompletions(state).map((completion) => completion.id)).toEqual(['c1']);
  });

  it('ignores a task that is deleted or does not exist', () => {
    const state = run(
      fresh(),
      addTask('t1', 'Run'),
      { type: 'task/delete', id: 't1', at: 2500 },
      complete('c1', 't1'),
      complete('c2', 'ghost'),
    );
    expect(liveCompletions(state)).toEqual([]);
  });

  it('never rewrites history when the task changes afterwards', () => {
    const start = fresh();
    const work = areaId(start, 'Work');
    const home = areaId(start, 'Home');
    const state = run(
      start,
      addTask('t1', 'Report', work),
      complete('c1', 't1'),
      { type: 'task/update', id: 't1', at: 4000, patch: { areaId: home, important: true } },
      { type: 'task/delete', id: 't1', at: 4500 },
      { type: 'area/delete', id: work, at: 5000 },
    );
    expect(liveCompletions(state)).toEqual([expect.objectContaining({ areaId: work, important: false })]);
  });

  it('can be undone, and the task can then be completed again', () => {
    const undone = run(fresh(), addTask('t1', 'Run'), complete('c1', 't1'), {
      type: 'completion/undo',
      id: 'c1',
      at: 3200,
    });
    expect(openTasks(undone).map((task) => task.id)).toEqual(['t1']);
    expect(liveCompletions(undone)).toEqual([]);
    expect(undone.completions.c1?.deletedAt).toBe(3200);

    const redone = run(undone, complete('c2', 't1', 3400));
    expect(liveCompletions(redone).map((completion) => completion.id)).toEqual(['c2']);
  });
});

describe('areas', () => {
  it('adds a new area after the others', () => {
    const state = run(fresh(), { type: 'area/add', id: 'a-new', at: 2000, name: ' Money ' });
    expect(liveAreas(state).map((area) => area.name)).toEqual([...SEED_AREA_NAMES, 'Money']);
  });

  it('renames an area, and ignores a blank name', () => {
    const start = fresh();
    const work = areaId(start, 'Work');
    const state = run(
      start,
      { type: 'area/rename', id: work, at: 2000, name: 'Career' },
      { type: 'area/rename', id: work, at: 2100, name: '  ' },
    );
    expect(state.areas[work]?.name).toBe('Career');
  });

  it('sends its tasks back to the Inbox when deleted', () => {
    const start = fresh();
    const work = areaId(start, 'Work');
    const state = run(start, addTask('t1', 'Report', work), { type: 'area/delete', id: work, at: 2500 });
    expect(liveAreas(state).map((area) => area.name)).not.toContain('Work');
    expect(tasksIn(openTasks(state), null).map((task) => task.id)).toEqual(['t1']);
  });
});

describe('deferring from Today', () => {
  const defer = (taskId: ID, dayKey = DAY_1): Action => ({ type: 'today/defer', dayKey, taskId });

  it('collects tasks set aside on the same day', () => {
    const state = run(fresh(), defer('t1'), defer('t2'), defer('t1'));
    expect([...deferredToday(state, DAY_1)]).toEqual(['t1', 't2']);
  });

  it('forgets them the next day', () => {
    const state = run(fresh(), defer('t1'), defer('t2'));
    expect(deferredToday(state, DAY_2).size).toBe(0);
    expect([...deferredToday(run(state, defer('t3', DAY_2)), DAY_2)]).toEqual(['t3']);
  });
});

describe('replacing the state', () => {
  it('swaps in the given state whole', () => {
    const other = run(fresh(), addTask('t9', 'From a backup'));
    expect(run(fresh(), { type: 'state/replace', state: other })).toBe(other);
  });
});
