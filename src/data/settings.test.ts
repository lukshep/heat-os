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

/** What the app saved before settings existed: version 1, with no settings at all. */
function versionOne(): Record<string, unknown> {
  let state = createInitialState(1000, newId);
  state = reduce(state, { type: 'task/add', id: 't1', at: 2000, title: 'Run', areaId: null });
  state = reduce(state, { type: 'task/complete', id: 'c1', at: 3000, dayKey: '2026-01-05', taskId: 't1' });
  const { settings: _added, ...rest } = JSON.parse(JSON.stringify(state));
  return { ...rest, schemaVersion: 1 };
}

describe('settings', () => {
  it('start at the tuned defaults', () => {
    const state = createInitialState(1000, newId);
    expect(state.settings).toEqual({ threshold: DEFAULT_CONFIG.threshold, dayStartHour: DEFAULT_CONFIG.dayStartHour });
  });

  it('can move the line and the start of the day', () => {
    const state = withSettings(createInitialState(1000, newId), { threshold: 70, dayStartHour: 6 });
    expect(state.settings).toEqual({ threshold: 70, dayStartHour: 6 });
  });

  it('changes one setting without touching the other', () => {
    const state = withSettings(createInitialState(1000, newId), { threshold: 45 });
    expect(state.settings).toEqual({ threshold: 45, dayStartHour: DEFAULT_SETTINGS.dayStartHour });
  });

  it('keeps values on a step and inside their limits', () => {
    expect(normalizeSettings({ threshold: 63, dayStartHour: 4.4 })).toEqual({ threshold: 65, dayStartHour: 4 });
    expect(normalizeSettings({ threshold: 500, dayStartHour: -3 })).toEqual({ threshold: 90, dayStartHour: 0 });
    expect(normalizeSettings({ threshold: 0, dayStartHour: 23 })).toEqual({ threshold: 20, dayStartHour: 8 });
  });

  it('falls back to the default for anything that is not a number', () => {
    expect(normalizeSettings({ threshold: 'high', dayStartHour: Number.NaN })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('returns the same state when nothing changes', () => {
    const state = createInitialState(1000, newId);
    expect(withSettings(state, { threshold: DEFAULT_SETTINGS.threshold })).toBe(state);
    expect(withSettings(state, {})).toBe(state);
  });

  it('change only the line and the day start in the HEAT config', () => {
    const config = heatConfig({ threshold: 75, dayStartHour: 2 });
    expect(config).toEqual({ ...DEFAULT_CONFIG, threshold: 75, dayStartHour: 2 });
  });
});

describe('saved data from before settings', () => {
  it('is brought up to the current version with default settings', () => {
    const old = versionOne();
    const state = parseState(old);
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

  it('does not alter the document it was given', () => {
    const old = versionOne();
    const before = JSON.stringify(old);
    parseState(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('is still refused when it is damaged', () => {
    const old = versionOne();
    delete old.completions;
    expect(parseState(old)).toBeNull();
  });

  it('loads from an old backup file', () => {
    const state = deserializeState(JSON.stringify(versionOne()));
    expect(state?.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saved settings', () => {
  it('round-trip through a backup', () => {
    const state = withSettings(createInitialState(1000, newId), { threshold: 80, dayStartHour: 0 });
    expect(deserializeState(serializeState(state))?.settings).toEqual({ threshold: 80, dayStartHour: 0 });
  });

  it('are pulled back inside their limits when a file asks for too much', () => {
    const saved = JSON.parse(JSON.stringify(createInitialState(1000, newId)));
    saved.settings = { threshold: 500, dayStartHour: 19 };
    expect(parseState(saved)?.settings).toEqual({ threshold: 90, dayStartHour: 8 });
  });

  it('must be present and numeric in a current document', () => {
    const missing = JSON.parse(JSON.stringify(createInitialState(1000, newId)));
    delete missing.settings;
    expect(parseState(missing)).toBeNull();

    const wrong = JSON.parse(JSON.stringify(createInitialState(1000, newId)));
    wrong.settings.threshold = 'sixty';
    expect(parseState(wrong)).toBeNull();
  });
});
