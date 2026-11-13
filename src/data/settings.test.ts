import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../heat/config';
import {
  createInitialState,
  DEFAULT_SETTINGS,
  normalizeSettings,
  SCHEMA_VERSION,
  type AppState,
  type Settings,
} from './model';
import { reduce } from './reducer';
import { heatConfig } from './selectors';
import { deserializeState, parseState, serializeState } from './storage';

let counter = 0;
const newId = () => `id-${++counter}`;

function withSettings(state: AppState, patch: Partial<Settings>): AppState {
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
  return { ...current(), schemaVersion: 2, settings: { threshold, dayStartHour } };
}

describe('settings', () => {
  it('start at the tuned default', () => {
    expect(createInitialState(1000, newId).settings).toEqual({ dayStartHour: DEFAULT_CONFIG.dayStartHour });
  });

  it('can move the start of the day', () => {
    expect(withSettings(createInitialState(1000, newId), { dayStartHour: 6 }).settings).toEqual({ dayStartHour: 6 });
  });

  it('keep the value on a step and inside its limits', () => {
    expect(normalizeSettings({ dayStartHour: 4.4 })).toEqual({ dayStartHour: 4 });
    expect(normalizeSettings({ dayStartHour: -3 })).toEqual({ dayStartHour: 0 });
    expect(normalizeSettings({ dayStartHour: 23 })).toEqual({ dayStartHour: 8 });
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
    expect(heatConfig({ dayStartHour: 2 })).toEqual({ ...DEFAULT_CONFIG, dayStartHour: 2 });
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
    expect(state?.settings).toEqual({ dayStartHour: 6 });
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
    expect(deserializeState(JSON.stringify(versionTwo(40, 2)))?.settings).toEqual({ dayStartHour: 2 });
  });
});

describe('saved settings', () => {
  it('round-trip through a backup', () => {
    const state = withSettings(createInitialState(1000, newId), { dayStartHour: 0 });
    expect(deserializeState(serializeState(state))?.settings).toEqual({ dayStartHour: 0 });
  });

  it('are pulled back inside their limits when a file asks for too much', () => {
    const saved = current();
    saved.settings = { dayStartHour: 19 };
    expect(parseState(saved)?.settings).toEqual({ dayStartHour: 8 });
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
