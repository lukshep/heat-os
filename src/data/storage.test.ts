import { describe, expect, it } from 'vitest';
import { createInitialState, SCHEMA_VERSION, type AppState } from './model';
import { reduce } from './reducer';
import { createMemoryStorage, deserializeState, parseState, serializeState } from './storage';

let counter = 0;
const newId = () => `id-${++counter}`;

function populated(): AppState {
  let state = createInitialState(1000, newId);
  state = reduce(state, { type: 'task/add', id: 't1', at: 2000, title: 'Run', areaId: null });
  state = reduce(state, { type: 'task/add', id: 't2', at: 2100, title: 'Read', areaId: null });
  state = reduce(state, { type: 'task/complete', id: 'c1', at: 3000, dayKey: '2026-01-05', taskId: 't1' });
  state = reduce(state, { type: 'today/defer', dayKey: '2026-01-05', taskId: 't2' });
  return state;
}

/** A copy that can be edited freely to build a damaged document. */
function copy(state: AppState): Record<string, any> {
  return JSON.parse(JSON.stringify(state));
}

describe('memory storage', () => {
  it('starts empty and returns what was saved', async () => {
    const storage = createMemoryStorage();
    expect(await storage.load()).toBeNull();
    const state = populated();
    await storage.save(state);
    expect(await storage.load()).toBe(state);
  });
});

describe('parseState', () => {
  it('accepts a fresh and a populated state', () => {
    const fresh = createInitialState(1000, newId);
    expect(parseState(fresh)).toEqual(fresh);
    const state = populated();
    expect(parseState(state)).toEqual(state);
  });

  it('rejects things that are not a state document', () => {
    expect(parseState(null)).toBeNull();
    expect(parseState('heat')).toBeNull();
    expect(parseState([])).toBeNull();
    expect(parseState({})).toBeNull();
  });

  it('rejects a document from a version it does not know', () => {
    expect(parseState({ ...populated(), schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
    expect(parseState({ ...populated(), schemaVersion: undefined })).toBeNull();
  });

  it('rejects a missing collection', () => {
    const damaged = copy(populated());
    delete damaged.completions;
    expect(parseState(damaged)).toBeNull();
  });

  it('rejects a record with a field of the wrong type', () => {
    const damaged = copy(populated());
    damaged.tasks.t1.important = 'yes';
    expect(parseState(damaged)).toBeNull();

    const badKind = copy(populated());
    badKind.completions.c1.kind = 'chore';
    expect(parseState(badKind)).toBeNull();
  });

  it('rejects a record filed under the wrong id', () => {
    const damaged = copy(populated());
    damaged.tasks.other = damaged.tasks.t1;
    expect(parseState(damaged)).toBeNull();
  });

  it('rejects a damaged deferred list', () => {
    const damaged = copy(populated());
    damaged.deferred = { dayKey: '2026-01-05', taskIds: [1, 2] };
    expect(parseState(damaged)).toBeNull();
  });
});

describe('backup files', () => {
  it('round-trips the state through text', () => {
    const state = populated();
    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('returns null for text that is not a backup', () => {
    expect(deserializeState('not json')).toBeNull();
    expect(deserializeState('{"hello":"world"}')).toBeNull();
  });
});
