import { describe, expect, it } from 'vitest';
import { minutesIntoDay, planToday, type ListItem } from './selectors';

const TODAY = '2026-11-15';
const DAY_START = 4;

let created = 0;

/** A list row with plain defaults: an undated, untimed task. */
function row(id: string, overrides: Partial<ListItem> = {}): ListItem {
  return {
    id,
    kind: 'task',
    title: id,
    areaId: 'work',
    projectId: null,
    priority: false,
    friction: false,
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
});
