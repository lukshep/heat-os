import { describe, expect, it } from 'vitest';
import { TEST_CONFIG as config } from '../heat/testConfig';
import { createInitialState, type AppState, type ID } from './model';
import { reduce, type Action } from './reducer';
import { inArea, itemsAt, listItems, liveAreas, placeLabel, places, type ListItem, type Place } from './selectors';

const TODAY = '2026-01-05';

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

const addProject = (id: ID, name: string, area: ID, parentId: ID | null = null, at = 2000): Action => ({
  type: 'project/add',
  id,
  at,
  name,
  areaId: area,
  parentId,
});

const addTask = (id: ID, title: string, area: ID | null, projectId: ID | null = null): Action => ({
  type: 'task/add',
  id,
  at: 3000,
  title,
  areaId: area,
  projectId,
});

/** Work holds Website (which holds Launch) and Blog. */
function withProjects(): { state: AppState; work: ID; health: ID } {
  const start = createInitialState(1000, newId);
  const work = areaId(start, 'Work');
  const health = areaId(start, 'Health');
  const state = run(
    start,
    addProject('website', 'Website', work, null, 2000),
    addProject('blog', 'Blog', work, null, 2100),
    addProject('launch', 'Launch', work, 'website', 2200),
  );
  return { state, work, health };
}

function placeOf(state: AppState, id: ID): Place {
  const place = places(state).find((candidate) => candidate.id === id);
  if (!place) throw new Error(`No place ${id}`);
  return place;
}

function item(state: AppState, id: ID): ListItem {
  const found = listItems(state, TODAY, config).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No item ${id}`);
  return found;
}

describe('the place tree', () => {
  it('lists each area, then its projects, each followed by its own', () => {
    const { state } = withProjects();
    expect(places(state).map((place) => `${'  '.repeat(place.depth)}${place.name}`)).toEqual([
      'Work',
      '  Website',
      '    Launch',
      '  Blog',
      'Health',
      'Home',
      'People',
      'Growth',
    ]);
  });

  it('knows where each place sits', () => {
    const { state, work } = withProjects();
    expect(placeOf(state, 'launch')).toMatchObject({
      key: 'project:launch',
      areaId: work,
      projectId: 'launch',
      depth: 2,
      ancestors: [work, 'website'],
      label: 'Work › Website › Launch',
    });
    expect(placeOf(state, work)).toMatchObject({ key: `area:${work}`, projectId: null, depth: 0, label: 'Work' });
  });

  it('shows a project whose parent is missing at the top of its area', () => {
    const { state } = withProjects();
    const website = state.projects.website!;
    const broken = { ...state, projects: { ...state.projects, website: { ...website, deletedAt: 9000 } } };
    expect(placeOf(broken, 'launch')).toMatchObject({ depth: 1, label: 'Work › Launch' });
  });
});

describe('projects', () => {
  it('takes the area of the project it is put inside', () => {
    const { state, work, health } = withProjects();
    const next = run(state, addProject('copy', 'Copy', health, 'launch'));
    expect(next.projects.copy).toMatchObject({ areaId: work, parentId: 'launch' });
  });

  it('needs a name and somewhere real to go', () => {
    const { state, work } = withProjects();
    expect(run(state, addProject('p', '   ', work))).toBe(state);
    expect(run(state, addProject('p', 'Lost', 'no-such-area'))).toBe(state);
    expect(run(state, addProject('p', 'Lost', work, 'no-such-project'))).toBe(state);
  });

  it('can be renamed', () => {
    const { state } = withProjects();
    const renamed = run(state, { type: 'project/rename', id: 'website', at: 4000, name: ' Site ' });
    expect(placeOf(renamed, 'launch').label).toBe('Work › Site › Launch');
    expect(run(state, { type: 'project/rename', id: 'website', at: 4000, name: ' ' })).toBe(state);
  });

  it('hands everything inside up one level when deleted', () => {
    const { state, work } = withProjects();
    const filled = run(
      state,
      addTask('t1', 'Write copy', work, 'website'),
      addTask('t2', 'Check links', work, 'website'),
      { type: 'task/makeRoutine', id: 't2', at: 3500, days: [1], asOf: '2026-01-04' },
      addTask('t3', 'Press release', work, 'launch'),
    );
    const gone = run(filled, { type: 'project/delete', id: 'website', at: 5000 });

    expect(places(gone).map((place) => place.label)).not.toContain('Work › Website');
    expect(placeOf(gone, 'launch')).toMatchObject({ depth: 1, label: 'Work › Launch' });
    expect(item(gone, 't1')).toMatchObject({ areaId: work, projectId: null });
    expect(item(gone, 't2')).toMatchObject({ kind: 'routine', areaId: work, projectId: null });
    expect(item(gone, 't3')).toMatchObject({ projectId: 'launch' });

    // Deleting the inner one lifts its task to the project above, not to the area.
    const inner = run(filled, { type: 'project/delete', id: 'launch', at: 5000 });
    expect(item(inner, 't3')).toMatchObject({ projectId: 'website' });
  });

  it('go when their area goes, and what they held lands in the Inbox', () => {
    const { state, work } = withProjects();
    const filled = run(state, addTask('t1', 'Write copy', work, 'launch'));
    const gone = run(filled, { type: 'area/delete', id: work, at: 6000 });
    expect(places(gone).some((place) => place.areaId === work)).toBe(false);
    expect(inArea(listItems(gone, TODAY, config), null).map((entry) => entry.id)).toEqual(['t1']);
    expect(item(gone, 't1').projectId).toBeNull();
  });
});

describe('putting items in places', () => {
  it('adds a task straight into a project, in that project’s area', () => {
    const { state, work, health } = withProjects();
    const next = run(state, addTask('t1', 'Write copy', health, 'launch'));
    expect(item(next, 't1')).toMatchObject({ areaId: work, projectId: 'launch' });
  });

  it('captures to the Inbox when the place does not exist', () => {
    const { state, work } = withProjects();
    const next = run(state, addTask('t1', 'Stray', work, 'no-such-project'));
    expect(item(next, 't1')).toMatchObject({ areaId: null, projectId: null });
  });

  it('finds only what sits directly in a place', () => {
    const { state, work } = withProjects();
    const next = run(
      state,
      addTask('top', 'At the top', work),
      addTask('mid', 'In Website', work, 'website'),
      addTask('deep', 'In Launch', work, 'launch'),
    );
    const all = listItems(next, TODAY, config);
    expect(itemsAt(all, placeOf(next, work)).map((entry) => entry.id)).toEqual(['top']);
    expect(itemsAt(all, placeOf(next, 'website')).map((entry) => entry.id)).toEqual(['mid']);
    expect(itemsAt(all, placeOf(next, 'launch')).map((entry) => entry.id)).toEqual(['deep']);
  });

  it('moves a task into a project, to the top of an area, and back to the Inbox', () => {
    const { state, work, health } = withProjects();
    const move = (patch: { areaId?: ID | null; projectId?: ID | null }): Action => ({
      type: 'task/update',
      id: 't1',
      at: 4000,
      patch,
    });
    const captured = run(state, addTask('t1', 'Write copy', null));

    const filed = run(captured, move({ projectId: 'launch' }));
    expect(item(filed, 't1')).toMatchObject({ areaId: work, projectId: 'launch' });

    const lifted = run(filed, move({ areaId: health, projectId: null }));
    expect(item(lifted, 't1')).toMatchObject({ areaId: health, projectId: null });

    const back = run(lifted, move({ areaId: null, projectId: null }));
    expect(item(back, 't1')).toMatchObject({ areaId: null, projectId: null });

    const nowhere = run(filed, move({ projectId: 'no-such-project' }));
    expect(item(nowhere, 't1')).toMatchObject({ areaId: work, projectId: 'launch' });
  });

  it('moves a routine between places but never to the Inbox', () => {
    const { state, work, health } = withProjects();
    const routine = run(state, addTask('r1', 'Review', health), {
      type: 'task/makeRoutine',
      id: 'r1',
      at: 3500,
      days: [1],
      asOf: '2026-01-04',
    });
    const moved = run(routine, { type: 'routine/update', id: 'r1', at: 4000, patch: { projectId: 'blog' } });
    expect(item(moved, 'r1')).toMatchObject({ kind: 'routine', areaId: work, projectId: 'blog' });

    const refused = run(moved, { type: 'routine/update', id: 'r1', at: 4100, patch: { areaId: null, projectId: null } });
    expect(item(refused, 'r1')).toMatchObject({ areaId: work, projectId: 'blog' });
  });

  it('keeps its project when a task becomes a routine and back', () => {
    const { state, work } = withProjects();
    const routine = run(state, addTask('t1', 'Review', work, 'blog'), {
      type: 'task/makeRoutine',
      id: 't1',
      at: 3500,
      days: [1],
      asOf: '2026-01-04',
    });
    expect(item(routine, 't1')).toMatchObject({ kind: 'routine', projectId: 'blog' });
    const task = run(routine, { type: 'routine/makeTask', id: 't1', at: 3600 });
    expect(item(task, 't1')).toMatchObject({ kind: 'task', projectId: 'blog' });
  });

  it('names where an item lives', () => {
    const { state, work } = withProjects();
    const all = places(state);
    expect(placeLabel(all, { areaId: null, projectId: null })).toBe('Inbox');
    expect(placeLabel(all, { areaId: work, projectId: null })).toBe('Work');
    expect(placeLabel(all, { areaId: work, projectId: 'launch' })).toBe('Work › Website › Launch');
  });
});
