import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STANDARD_TUNING, tuned, type Tuning } from '../heat/config';
import { DAY_MS } from '../heat/day';
import { foldHeat, frictionFactor } from '../heat/engine';
import {
  createInitialState,
  currentTuning,
  DEFAULT_SETTINGS,
  normalizeSettings,
  SCHEMA_VERSION,
  type AppState,
  type Settings,
} from './model';
import { reduce } from './reducer';
import { TEST_CONFIG } from '../heat/testConfig';
import { heatCompletions, heatConfig, heatTimeline, openTasks, routineLog, routineWarmth } from './selectors';
import { deserializeState, parseState, serializeState } from './storage';

let counter = 0;
const newId = () => `id-${++counter}`;

function withSettings(state: AppState, patch: Partial<Pick<Settings, 'dayStartHour'>>): AppState {
  return reduce(state, { type: 'settings/update', patch });
}

/** A current state with a task and a completion in it, as plain data. */
function current(): Record<string, any> {
  let state = createInitialState(1000, newId);
  state = reduce(state, { type: 'task/add', id: 't1', at: 2000, title: 'Run', areaId: null });
  state = reduce(state, { type: 'task/complete', id: 'c1', at: 3000, dayKey: '2026-01-05', taskId: 't1' });
  return JSON.parse(JSON.stringify(state));
}

/** A collection with `change` applied to each record. */
function eachRecord(collection: Record<string, any>, change: (record: any) => any): Record<string, any> {
  return Object.fromEntries(Object.entries(collection).map(([id, record]) => [id, change(record)]));
}

/**
 * A current document as version 6 saved it: Priority and Friction as tags on tasks, routines
 * and completions alike.
 */
function versionSix(): Record<string, any> {
  const document = current();
  const asTag = (record: any) => ({ ...record, friction: record.friction > 0 });
  return {
    ...document,
    schemaVersion: 6,
    tasks: eachRecord(document.tasks, asTag),
    routines: eachRecord(document.routines, asTag),
    completions: eachRecord(document.completions, (completion) => ({ ...asTag(completion), priority: false })),
  };
}

/**
 * A current document as version 5 saved it: no dates or times, schedules that were always
 * weekly, and completions that said whether their day was scheduled.
 */
function versionFive(): Record<string, any> {
  const document = versionSix();
  return {
    ...document,
    schemaVersion: 5,
    tasks: eachRecord(document.tasks, ({ date: _date, time: _time, ...rest }) => rest),
    routines: eachRecord(document.routines, ({ time: _time, schedule, ...rest }) => ({
      ...rest,
      schedule: { days: schedule.days },
    })),
    completions: eachRecord(document.completions, ({ occurrence, ...rest }) => ({
      ...rest,
      scheduled: occurrence !== null,
    })),
  };
}

/** A collection with its tags under the names every version before 5 saved them by. */
function oldTags(collection: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(collection).map(([id, { priority, friction, ...rest }]) => [
      id,
      { ...rest, important: priority, avoided: friction },
    ]),
  );
}

/** A current document as a build before version 5 would have saved it. */
function beforeTagRename(): Record<string, any> {
  const document = versionFive();
  return {
    ...document,
    tasks: oldTags(document.tasks),
    routines: oldTags(document.routines),
    completions: oldTags(document.completions),
  };
}

/** What the app saved before settings existed: version 1, with no settings at all. */
function versionOne(): Record<string, any> {
  const { settings: _added, ...rest } = beforeTagRename();
  return { ...rest, schemaVersion: 1 };
}

/** What the app saved while there was a line to reach: version 2, with a threshold. */
function versionTwo(threshold = 75, dayStartHour = 6): Record<string, any> {
  const { heatResetAt: _added, ...rest } = beforeTagRename();
  return { ...rest, schemaVersion: 2, settings: { threshold, dayStartHour } };
}

/** What the app saved before Effort, Cooling and the reset: version 3, with only the day start. */
function versionThree(dayStartHour = 6): Record<string, any> {
  const { heatResetAt: _added, ...rest } = beforeTagRename();
  return { ...rest, schemaVersion: 3, settings: { dayStartHour } };
}

/** What the app saved before the tags were renamed: version 4, with Important and Avoided. */
function versionFour(): Record<string, any> {
  return { ...beforeTagRename(), schemaVersion: 4 };
}

describe('settings', () => {
  it('start at the tuned default', () => {
    expect(createInitialState(1000, newId).settings).toEqual({ dayStartHour: DEFAULT_CONFIG.dayStartHour, tuning: [] });
  });

  it('can move the start of the day', () => {
    expect(withSettings(createInitialState(1000, newId), { dayStartHour: 6 }).settings).toEqual({
      dayStartHour: 6,
      tuning: [],
    });
  });

  it('keep the value on a step and inside its limits', () => {
    expect(normalizeSettings({ dayStartHour: 4.4 }).dayStartHour).toBe(4);
    expect(normalizeSettings({ dayStartHour: -3 }).dayStartHour).toBe(0);
    expect(normalizeSettings({ dayStartHour: 23 }).dayStartHour).toBe(8);
  });

  it('fall back to the default for anything that is not a number', () => {
    expect(normalizeSettings({ dayStartHour: Number.NaN })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('return the same state when nothing changes', () => {
    const state = createInitialState(1000, newId);
    expect(withSettings(state, { dayStartHour: DEFAULT_SETTINGS.dayStartHour })).toBe(state);
    expect(withSettings(state, {})).toBe(state);
  });

  it('change only the day start in the HEAT config', () => {
    expect(heatConfig({ dayStartHour: 2, tuning: [] })).toEqual({ ...DEFAULT_CONFIG, dayStartHour: 2 });
  });
});

describe('saved data from before settings (version 1)', () => {
  it('is brought up to the current version with default settings', () => {
    const state = parseState(versionOne());
    expect(state?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps everything else exactly as it was', () => {
    const old = versionOne();
    const state = parseState(old);
    expect(state?.tasks).toEqual(current().tasks);
    expect(state?.completions).toEqual(current().completions);
    expect(state?.areas).toEqual(old.areas);
    expect(state?.deferred).toEqual(old.deferred);
  });

  it('is still refused when it is damaged', () => {
    const old = versionOne();
    delete old.completions;
    expect(parseState(old)).toBeNull();
  });
});

describe('saved data from when there was a line to reach (version 2)', () => {
  it('drops the threshold and keeps the day start the person chose', () => {
    const state = parseState(versionTwo(75, 6));
    expect(state?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state?.settings).toEqual({ dayStartHour: 6, tuning: [] });
  });

  it('keeps everything else exactly as it was', () => {
    const old = versionTwo();
    const state = parseState(old);
    expect(state?.tasks).toEqual(current().tasks);
    expect(state?.completions).toEqual(current().completions);
    expect(state?.areas).toEqual(old.areas);
  });

  it('does not alter the document it was given', () => {
    const old = versionTwo();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is refused when its settings are missing or damaged', () => {
    const missing = versionTwo();
    delete missing.settings;
    expect(parseState(missing)).toBeNull();

    const damaged = versionTwo();
    damaged.settings.dayStartHour = 'four';
    expect(parseState(damaged)).toBeNull();
  });

  it('loads from an old backup file', () => {
    expect(deserializeState(JSON.stringify(versionTwo(40, 2)))?.settings).toEqual({ dayStartHour: 2, tuning: [] });
  });
});

describe('saved settings', () => {
  it('round-trip through a backup', () => {
    const state = withSettings(createInitialState(1000, newId), { dayStartHour: 0 });
    expect(deserializeState(serializeState(state))?.settings).toEqual({ dayStartHour: 0, tuning: [] });
  });

  it('are pulled back inside their limits when a file asks for too much', () => {
    const saved = current();
    saved.settings = { dayStartHour: 19, tuning: [] };
    expect(parseState(saved)?.settings).toEqual({ dayStartHour: 8, tuning: [] });
  });

  it('must be present and numeric in a current document', () => {
    const missing = current();
    delete missing.settings;
    expect(parseState(missing)).toBeNull();

    const wrong = current();
    wrong.settings.dayStartHour = 'four';
    expect(parseState(wrong)).toBeNull();
  });

  it('refuses a document from a version newer than this build', () => {
    expect(parseState({ ...current(), schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
  });
});

describe('Effort and Cooling', () => {
  const easier: Tuning = { ...STANDARD_TUNING, effort: 'easier' };
  const tune = (state: AppState, at: number, tuning: Tuning = easier) =>
    reduce(state, { type: 'settings/tune', at, tuning });

  it('start as Standard', () => {
    expect(currentTuning(createInitialState(1000, newId).settings)).toEqual(STANDARD_TUNING);
  });

  it('are kept as dated changes, and the latest is in force', () => {
    let state = tune(createInitialState(1000, newId), 5000);
    state = tune(state, 9000, { effort: 'easier', cooling: 'slower' });
    expect(state.settings.tuning).toEqual([
      { at: 5000, effort: 'easier', cooling: 'standard' },
      { at: 9000, effort: 'easier', cooling: 'slower' },
    ]);
    expect(currentTuning(state.settings)).toEqual({ effort: 'easier', cooling: 'slower' });
    expect(heatConfig(state.settings)).toEqual(tuned(DEFAULT_CONFIG, { effort: 'easier', cooling: 'slower' }));
  });

  it('return the same state when nothing changes', () => {
    const state = createInitialState(1000, newId);
    expect(tune(state, 5000, STANDARD_TUNING)).toBe(state);
    const once = tune(state, 5000);
    expect(tune(once, 9000)).toBe(once);
  });

  it('leave the day start alone, and the day start leaves them alone', () => {
    const state = withSettings(tune(createInitialState(1000, newId), 5000), { dayStartHour: 6 });
    expect(state.settings.tuning).toHaveLength(1);
    expect(state.settings.dayStartHour).toBe(6);
  });

  it('replay as Standard until the first change, then each change from its own moment', () => {
    const state = tune(createInitialState(1000, newId), 5000);
    const [before, after] = heatTimeline(state.settings);
    expect(before?.config).toEqual(DEFAULT_CONFIG);
    expect(after).toEqual({ from: 5000, config: tuned(DEFAULT_CONFIG, easier) });
  });

  it('do not move HEAT already earned', () => {
    const state = current() as AppState;
    const now = 3000 + DAY_MS;
    const before = foldHeat(heatCompletions(state), heatTimeline(state.settings), now, '2026-01-06').heat;
    const changed = tune(state, now, { effort: 'harder', cooling: 'faster' });
    const after = foldHeat(heatCompletions(changed), heatTimeline(changed.settings), now, '2026-01-06').heat;
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(before);
  });
});

describe('resetting HEAT', () => {
  const now = 10_000;
  const heatAt = (state: AppState) =>
    foldHeat(heatCompletions(state), heatTimeline(state.settings), now, '2026-01-05').heat;

  it('starts HEAT again from cold', () => {
    const state = current() as AppState;
    expect(heatAt(state)).toBeGreaterThan(0);
    const reset = reduce(state, { type: 'heat/reset', at: now });
    expect(reset.heatResetAt).toBe(now);
    expect(heatAt(reset)).toBe(0);
  });

  it('keeps the completion log, so what was done stays done', () => {
    const state = current() as AppState;
    const reset = reduce(state, { type: 'heat/reset', at: now });
    expect(reset.completions).toEqual(state.completions);
    expect(openTasks(reset).map((task) => task.id)).not.toContain('t1');
  });

  it('counts completions made after it', () => {
    let state = reduce(current() as AppState, { type: 'heat/reset', at: now });
    state = reduce(state, { type: 'task/add', id: 't2', at: now + 1, title: 'Read', areaId: null });
    state = reduce(state, { type: 'task/complete', id: 'c2', at: now + 2, dayKey: '2026-01-05', taskId: 't2' });
    expect(heatCompletions(state).map((completion) => completion.id)).toEqual(['c2']);
  });
});

describe('saved data from before Effort, Cooling and the reset (version 3)', () => {
  it('is brought up to the current version with Standard and no reset', () => {
    const state = parseState(versionThree(6));
    expect(state?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state?.settings).toEqual({ dayStartHour: 6, tuning: [] });
    expect(state?.heatResetAt).toBeNull();
  });

  it('keeps everything else exactly as it was', () => {
    const old = versionThree();
    const state = parseState(old);
    expect(state?.tasks).toEqual(current().tasks);
    expect(state?.completions).toEqual(current().completions);
    expect(state?.areas).toEqual(old.areas);
    expect(state?.deferred).toEqual(old.deferred);
  });

  it('does not alter the document it was given', () => {
    const old = versionThree();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is still refused when it is damaged', () => {
    const old = versionThree();
    old.settings.dayStartHour = 'four';
    expect(parseState(old)).toBeNull();
  });
});

describe('saved Effort, Cooling and reset', () => {
  it('round-trip through a backup', () => {
    let state = createInitialState(1000, newId);
    state = reduce(state, { type: 'settings/tune', at: 5000, tuning: { effort: 'harder', cooling: 'slower' } });
    state = reduce(state, { type: 'heat/reset', at: 6000 });
    const restored = deserializeState(serializeState(state));
    expect(restored?.settings.tuning).toEqual([{ at: 5000, effort: 'harder', cooling: 'slower' }]);
    expect(restored?.heatResetAt).toBe(6000);
  });

  it('are put back in the order they were made', () => {
    const saved = current();
    saved.settings.tuning = [
      { at: 9000, effort: 'harder', cooling: 'standard' },
      { at: 5000, effort: 'easier', cooling: 'standard' },
    ];
    expect(parseState(saved)?.settings.tuning.map((change) => change.at)).toEqual([5000, 9000]);
  });

  it('refuse a document with a step this build does not know', () => {
    const unknown = current();
    unknown.settings.tuning = [{ at: 5000, effort: 'heroic', cooling: 'standard' }];
    expect(parseState(unknown)).toBeNull();

    const undated = current();
    undated.settings.tuning = [{ effort: 'easier', cooling: 'standard' }];
    expect(parseState(undated)).toBeNull();
  });

  it('refuse a document whose reset time is not a time', () => {
    const wrong = current();
    wrong.heatResetAt = 'yesterday';
    expect(parseState(wrong)).toBeNull();

    const missing = current();
    delete missing.heatResetAt;
    expect(parseState(missing)).toBeNull();
  });
});

describe('saved data from before the tags were renamed (version 4)', () => {
  /** A version 4 document whose task, routine and completion carry tags. */
  function tagged(): Record<string, any> {
    const old = versionFour();
    old.tasks.t1.important = true;
    old.completions.c1.avoided = true;
    old.routines.r1 = { ...old.tasks.t1, id: 'r1', areaId: 'a1', important: false, avoided: true };
    old.routines.r1.schedule = { days: [1] };
    old.routines.r1.warmthBase = { warmth: 0, missRun: 0, asOf: '2026-01-04' };
    return old;
  }

  it('renames Important to Priority and Avoided to Friction, keeping every value', () => {
    const state = parseState(tagged());
    expect(state?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state?.tasks.t1).toMatchObject({ priority: true, friction: 0 });
    expect(state?.routines.r1).toMatchObject({ priority: false, friction: 3 });
    expect(state?.completions.c1).toMatchObject({ friction: 3 });
  });

  it('leaves no trace of the old names', () => {
    const state = parseState(tagged());
    for (const record of [state?.tasks.t1, state?.routines.r1, state?.completions.c1]) {
      expect(record).not.toHaveProperty('important');
      expect(record).not.toHaveProperty('avoided');
    }
  });

  it('keeps everything else exactly as it was', () => {
    const old = tagged();
    const state = parseState(old);
    const now = current();
    expect(state?.tasks).toEqual({ t1: { ...now.tasks.t1, priority: true } });
    expect(state?.completions).toEqual({ c1: { ...now.completions.c1, friction: 3 } });
    expect(state?.settings).toEqual(old.settings);
    expect(state?.areas).toEqual(old.areas);
  });

  it('does not alter the document it was given', () => {
    const old = tagged();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is refused when a record has lost a tag', () => {
    const old = tagged();
    delete old.tasks.t1.important;
    expect(parseState(old)).toBeNull();
  });
});

describe('saved data from before dates and monthly routines (version 5)', () => {
  /**
   * A version 5 document with a weekly routine due on Mondays, done on Monday 5 January and
   * again on Tuesday, a day it was not due.
   */
  function withRoutine(): Record<string, any> {
    const old = versionFive();
    old.routines.r1 = {
      id: 'r1',
      createdAt: 2000,
      updatedAt: 2000,
      deletedAt: null,
      title: 'Run',
      areaId: 'a1',
      projectId: null,
      priority: false,
      friction: false,
      schedule: { days: [1] },
      warmthBase: { warmth: 0.5, missRun: 0, asOf: '2026-01-04' },
    };
    const routineCompletion = { ...old.completions.c1, itemId: 'r1', kind: 'routine', warmth: 0.5 };
    old.completions.c2 = { ...routineCompletion, id: 'c2', dayKey: '2026-01-05', scheduled: true };
    old.completions.c3 = { ...routineCompletion, id: 'c3', dayKey: '2026-01-06', scheduled: false };
    return old;
  }

  it('is brought up to the current version', () => {
    expect(parseState(withRoutine())?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('gives every task no day and no time', () => {
    expect(parseState(withRoutine())?.tasks.t1).toMatchObject({ date: null, time: null });
  });

  it('makes every schedule weekly with the same days, and gives routines no time', () => {
    const old = withRoutine();
    const routine = parseState(old)?.routines.r1;
    expect(routine?.schedule).toEqual({ every: 'week', days: [1] });
    expect(routine?.time).toBeNull();
    expect(routine?.warmthBase).toEqual(old.routines.r1.warmthBase);
  });

  it('records the date a completion counted for only where its day was scheduled', () => {
    const completions = parseState(withRoutine())?.completions;
    expect(completions?.c1?.occurrence).toBeNull();
    expect(completions?.c2?.occurrence).toBe('2026-01-05');
    expect(completions?.c3?.occurrence).toBeNull();
    for (const completion of Object.values(completions ?? {})) expect(completion).not.toHaveProperty('scheduled');
  });

  it('leaves warmth where the old rule put it', () => {
    const state = parseState(withRoutine());
    const routine = state?.routines.r1;
    if (!state || !routine) throw new Error('The document was refused');
    // Monday's date was kept; Tuesday's extra completion still counts for nothing.
    const warmth = routineWarmth(routine, routineLog(state, 'r1'), '2026-01-12', TEST_CONFIG).warmth;
    expect(warmth).toBeCloseTo(0.625, 10);
  });

  it('keeps everything else exactly as it was', () => {
    const old = withRoutine();
    const state = parseState(old);
    const { scheduled: _scheduled, priority: _priority, ...rest } = old.completions.c2;
    expect(state?.completions.c2).toEqual({ ...rest, friction: 0, occurrence: '2026-01-05' });
    expect(state?.areas).toEqual(old.areas);
    expect(state?.settings).toEqual(old.settings);
    expect(state?.deferred).toEqual(old.deferred);
    expect(state?.heatResetAt).toEqual(old.heatResetAt);
  });

  it('does not alter the document it was given', () => {
    const old = withRoutine();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is refused when a completion has lost whether its day was scheduled', () => {
    const old = withRoutine();
    delete old.completions.c2.scheduled;
    expect(parseState(old)).toBeNull();
  });
});

describe('saved data from before Friction had stars (version 6)', () => {
  /**
   * A version 6 document: a task with both tags, a routine with Priority, and four completions,
   * one with each mix of tags.
   */
  function tagged(): Record<string, any> {
    const old = versionSix();
    old.tasks.t1 = { ...old.tasks.t1, priority: true, friction: true };
    old.routines.r1 = {
      id: 'r1',
      createdAt: 2000,
      updatedAt: 2000,
      deletedAt: null,
      title: 'Run',
      areaId: 'a1',
      projectId: null,
      priority: true,
      friction: false,
      time: null,
      schedule: { every: 'week', days: [1] },
      warmthBase: { warmth: 0, missRun: 0, asOf: '2026-01-04' },
    };
    const completion = old.completions.c1;
    old.completions.c1 = { ...completion, priority: false, friction: true };
    old.completions.c2 = { ...completion, id: 'c2', priority: true, friction: false };
    old.completions.c3 = { ...completion, id: 'c3', priority: true, friction: true };
    old.completions.c4 = { ...completion, id: 'c4', priority: false, friction: false };
    return old;
  }

  it('is brought up to the current version', () => {
    expect(parseState(tagged())?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('gives Friction three stars on tasks and routines, and keeps Priority on them', () => {
    const state = parseState(tagged());
    expect(state?.tasks.t1).toMatchObject({ priority: true, friction: 3 });
    expect(state?.routines.r1).toMatchObject({ priority: true, friction: 0 });
  });

  it('gives each completion the stars that earn what its tags earned, and takes Priority off it', () => {
    const completions = parseState(tagged())?.completions ?? {};
    expect([completions.c1, completions.c2, completions.c3, completions.c4].map((entry) => entry?.friction)).toEqual([
      3, 2, 5, 0,
    ]);
    for (const completion of Object.values(completions)) expect(completion).not.toHaveProperty('priority');
  });

  it('leaves what each completion earned where it was: 30% for Friction, 20% for Priority, 50% for both', () => {
    const completions = parseState(tagged())?.completions ?? {};
    const share = (id: string) =>
      frictionFactor({ areaId: null, friction: completions[id]?.friction ?? -1, warmth: 0 }, DEFAULT_CONFIG) - 1;
    expect(share('c1')).toBeCloseTo(0.3, 10);
    expect(share('c2')).toBeCloseTo(0.2, 10);
    expect(share('c3')).toBeCloseTo(0.5, 10);
    expect(share('c4')).toBe(0);
  });

  it('keeps everything else exactly as it was', () => {
    const old = tagged();
    const state = parseState(old);
    const { priority: _priority, ...rest } = old.completions.c1;
    expect(state?.completions.c1).toEqual({ ...rest, friction: 3 });
    expect(state?.tasks.t1).toEqual({ ...old.tasks.t1, friction: 3 });
    expect(state?.areas).toEqual(old.areas);
    expect(state?.settings).toEqual(old.settings);
  });

  it('does not alter the document it was given', () => {
    const old = tagged();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is refused when a tag is damaged', () => {
    const task = tagged();
    task.tasks.t1.friction = 2;
    expect(parseState(task)).toBeNull();

    const completion = tagged();
    delete completion.completions.c2.priority;
    expect(parseState(completion)).toBeNull();
  });
});

describe('Friction stars', () => {
  it('are refused when they are not a whole number from none to five', () => {
    for (const friction of [6, -1, 2.5, true, '3']) {
      const document = current();
      document.tasks.t1.friction = friction;
      expect(parseState(document)).toBeNull();
    }
  });
});
