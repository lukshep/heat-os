import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STANDARD_TUNING, tuned, type Tuning } from '../heat/config';
import { DAY_MS } from '../heat/day';
import { foldHeat } from '../heat/engine';
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
import { heatCompletions, heatConfig, heatTimeline, openTasks } from './selectors';
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

/** What the app saved before settings existed: version 1, with no settings at all. */
function versionOne(): Record<string, any> {
  const { settings: _added, ...rest } = current();
  return { ...rest, schemaVersion: 1 };
}

/** What the app saved while there was a line to reach: version 2, with a threshold. */
function versionTwo(threshold = 75, dayStartHour = 6): Record<string, any> {
  const { heatResetAt: _added, ...rest } = current();
  return { ...rest, schemaVersion: 2, settings: { threshold, dayStartHour } };
}

/** What the app saved before Effort, Cooling and the reset: version 3, with only the day start. */
function versionThree(dayStartHour = 6): Record<string, any> {
  const { heatResetAt: _added, ...rest } = current();
  return { ...rest, schemaVersion: 3, settings: { dayStartHour } };
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
    expect(state?.tasks).toEqual(old.tasks);
    expect(state?.completions).toEqual(old.completions);
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
    expect(state?.tasks).toEqual(old.tasks);
    expect(state?.completions).toEqual(old.completions);
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
    expect(state?.tasks).toEqual(old.tasks);
    expect(state?.completions).toEqual(old.completions);
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
