import { COOLINGS, EFFORTS } from '../heat/config';
import { DEFAULT_SETTINGS, normalizeSettings, SCHEMA_VERSION, type AppState, type TuningChange } from './model';

/** Where the state document is kept. Swappable so tests, and later sync, need no browser. */
export interface StorageAdapter {
  /** The raw saved document, or null when nothing has been saved. */
  load(): Promise<unknown>;
  save(state: AppState): Promise<void>;
}

export function createMemoryStorage(initial: unknown = null): StorageAdapter {
  let saved = initial;
  return {
    load: async () => saved,
    save: async (state) => {
      saved = state;
    },
  };
}

const STORE = 'kv';
const KEY = 'state';

/** One object store holding one document. Throws if IndexedDB is unavailable. */
export function createIndexedDbStorage(name = 'heat'): StorageAdapter {
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return {
    async load() {
      const db = await opening;
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async save(state) {
      const db = await opening;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(state, KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown) => typeof value === 'string';
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown) => typeof value === 'boolean';
const isStringOrNull = (value: unknown) => value === null || isString(value);
const isNumberOrNull = (value: unknown) => value === null || isNumber(value);

type Check = (value: unknown) => boolean;

const META: Record<string, Check> = {
  id: isString,
  createdAt: isNumber,
  updatedAt: isNumber,
  deletedAt: isNumberOrNull,
};

const SHAPES: Record<string, Record<string, Check>> = {
  areas: { ...META, name: isString, order: isNumber },
  projects: { ...META, name: isString, areaId: isString, parentId: isStringOrNull, order: isNumber },
  tasks: {
    ...META,
    title: isString,
    areaId: isStringOrNull,
    projectId: isStringOrNull,
    priority: isBoolean,
    friction: isBoolean,
  },
  routines: {
    ...META,
    title: isString,
    areaId: isString,
    projectId: isStringOrNull,
    priority: isBoolean,
    friction: isBoolean,
    schedule: (value) => isDict(value) && Array.isArray(value.days) && value.days.every(isNumber),
    warmthBase: (value) =>
      isDict(value) && isNumber(value.warmth) && isNumber(value.missRun) && isString(value.asOf),
  },
  completions: {
    ...META,
    at: isNumber,
    dayKey: isString,
    itemId: isString,
    kind: (value) => value === 'task' || value === 'routine',
    areaId: isStringOrNull,
    priority: isBoolean,
    friction: isBoolean,
    warmth: isNumber,
    scheduled: isBoolean,
  },
};

function isCollection(value: unknown, shape: Record<string, Check>): boolean {
  if (!isDict(value)) return false;
  return Object.entries(value).every(
    ([id, record]) =>
      isDict(record) && record.id === id && Object.entries(shape).every(([field, check]) => check(record[field])),
  );
}

/**
 * Brings a document saved by an older version up to the current shape, one version at a
 * time. Each new version adds a step here that turns version n into n + 1. A document from
 * a version this build does not know, newer ones included, is refused.
 */
function migrate(raw: Dict): Dict | null {
  let document = raw;

  // Version 2 added settings: a line to reach each day, and the hour the day starts.
  if (document.schemaVersion === 1) {
    document = { ...document, schemaVersion: 2, settings: { threshold: 60, ...DEFAULT_SETTINGS } };
  }

  // Version 3 dropped the line, so the threshold goes and only the day start is kept.
  if (document.schemaVersion === 2) {
    const settings = isDict(document.settings) ? { dayStartHour: document.settings.dayStartHour } : document.settings;
    document = { ...document, schemaVersion: 3, settings };
  }

  // Version 4 added Effort and Cooling, which were Standard until now, and the HEAT reset.
  if (document.schemaVersion === 3) {
    const settings = isDict(document.settings) ? { ...document.settings, tuning: [] } : document.settings;
    document = { ...document, schemaVersion: 4, settings, heatResetAt: null };
  }

  // Version 5 renamed the tags: Important became Priority, and Avoided became Friction.
  if (document.schemaVersion === 4) {
    document = {
      ...document,
      schemaVersion: 5,
      tasks: renameTags(document.tasks),
      routines: renameTags(document.routines),
      completions: renameTags(document.completions),
    };
  }

  return document.schemaVersion === SCHEMA_VERSION ? document : null;
}

/** A collection with each record's `important` and `avoided` renamed `priority` and `friction`. */
function renameTags(collection: unknown): unknown {
  if (!isDict(collection)) return collection;
  const renamed: Dict = {};
  for (const [id, record] of Object.entries(collection)) {
    if (!isDict(record)) {
      renamed[id] = record;
      continue;
    }
    const { important, avoided, ...rest } = record;
    renamed[id] = { ...rest, priority: important, friction: avoided };
  }
  return renamed;
}

/**
 * Checks a saved or imported document and returns it as state, or null when it is not one.
 * Anything loaded from disk or a backup file goes through here before the app trusts it.
 */
export function parseState(raw: unknown): AppState | null {
  if (!isDict(raw)) return null;
  const current = migrate(raw);
  if (!current) return null;

  for (const [collection, shape] of Object.entries(SHAPES)) {
    if (!isCollection(current[collection], shape)) return null;
  }

  const deferred = current.deferred;
  if (!isDict(deferred) || !isString(deferred.dayKey)) return null;
  if (!Array.isArray(deferred.taskIds) || !deferred.taskIds.every(isString)) return null;

  const settings = current.settings;
  if (!isDict(settings) || !isNumber(settings.dayStartHour)) return null;
  if (!Array.isArray(settings.tuning) || !settings.tuning.every(isTuningChange)) return null;
  if (!isNumberOrNull(current.heatResetAt)) return null;

  // A hand-edited backup could ask for a day that starts at an impossible hour; pull it back in.
  const normalized = normalizeSettings({ dayStartHour: settings.dayStartHour, tuning: settings.tuning });
  return { ...current, settings: normalized } as unknown as AppState;
}

function isTuningChange(value: unknown): value is TuningChange {
  return (
    isDict(value) &&
    isNumber(value.at) &&
    (EFFORTS as readonly unknown[]).includes(value.effort) &&
    (COOLINGS as readonly unknown[]).includes(value.cooling)
  );
}

/** The backup file's contents. */
export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Reads a backup file's contents. Returns null if it is not a HEAT backup. */
export function deserializeState(text: string): AppState | null {
  try {
    return parseState(JSON.parse(text));
  } catch {
    return null;
  }
}
