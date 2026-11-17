import { COOLINGS, EFFORTS, FRICTION_STARS } from '../heat/config';
import { isDayKey } from '../heat/day';
import {
  DEFAULT_SETTINGS,
  isClockTime,
  normalizeSettings,
  SCHEMA_VERSION,
  type AppState,
  type TuningChange,
} from './model';

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
const isDayKeyOrNull = (value: unknown) => value === null || isDayKey(value);
const isClockTimeOrNull = (value: unknown) => value === null || isClockTime(value);
const isStars = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= FRICTION_STARS;
const isSchedule = (value: unknown) =>
  isDict(value) &&
  (value.every === 'week' || value.every === 'month') &&
  Array.isArray(value.days) &&
  value.days.every(isNumber);
const isSubtasks = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (subtask) => isDict(subtask) && isString(subtask.id) && isString(subtask.title) && isDayKeyOrNull(subtask.checked),
  );

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
    description: isString,
    subtasks: isSubtasks,
    areaId: isStringOrNull,
    projectId: isStringOrNull,
    priority: isBoolean,
    friction: isStars,
    date: isDayKeyOrNull,
    time: isClockTimeOrNull,
  },
  routines: {
    ...META,
    title: isString,
    description: isString,
    subtasks: isSubtasks,
    areaId: isString,
    projectId: isStringOrNull,
    priority: isBoolean,
    friction: isStars,
    time: isClockTimeOrNull,
    schedule: isSchedule,
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
    friction: isStars,
    warmth: isNumber,
    occurrence: isDayKeyOrNull,
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
    const renameTags = ({ important, avoided, ...rest }: Dict): Dict => ({
      ...rest,
      priority: important,
      friction: avoided,
    });
    document = {
      ...document,
      schemaVersion: 5,
      tasks: eachRecord(document.tasks, renameTags),
      routines: eachRecord(document.routines, renameTags),
      completions: eachRecord(document.completions, renameTags),
    };
  }

  // Version 6 added dates and times, monthly schedules, and the date a completion counted for.
  // Until now every schedule was weekly, and a routine counted only on its scheduled days.
  if (document.schemaVersion === 5) {
    document = {
      ...document,
      schemaVersion: 6,
      tasks: eachRecord(document.tasks, (task) => ({ ...task, date: null, time: null })),
      routines: eachRecord(document.routines, (routine) => ({
        ...routine,
        time: null,
        schedule: isDict(routine.schedule) ? { every: 'week', days: routine.schedule.days } : routine.schedule,
      })),
      completions: eachRecord(document.completions, ({ scheduled, ...rest }) => {
        // A damaged flag stays damaged, so the document is still refused.
        if (typeof scheduled !== 'boolean') return { ...rest, occurrence: scheduled };
        return { ...rest, occurrence: scheduled && rest.kind === 'routine' ? rest.dayKey : null };
      }),
    };
  }

  // Version 7 made Friction a number of stars, worth 10% of a reward each, and Priority stopped
  // adding to a reward. Friction was worth 30% and Priority 20%, so a completion keeps exactly
  // what it earned as three stars for Friction and two for Priority. A task or routine with
  // Friction gets three stars, which earn what it earns now; Priority stays on it, for ordering.
  if (document.schemaVersion === 6) {
    document = {
      ...document,
      schemaVersion: 7,
      tasks: eachRecord(document.tasks, ({ friction, ...rest }) => ({ ...rest, friction: starsFor(friction, false) })),
      routines: eachRecord(document.routines, ({ friction, ...rest }) => ({
        ...rest,
        friction: starsFor(friction, false),
      })),
      completions: eachRecord(document.completions, ({ priority, friction, ...rest }) => ({
        ...rest,
        friction: starsFor(friction, priority),
      })),
    };
  }

  // Version 8 gave tasks and routines a description and subtasks. A task could carry a `note`
  // that nothing wrote; if one is there, it becomes the description.
  if (document.schemaVersion === 7) {
    const withDetails = ({ note, ...rest }: Dict): Dict => ({
      ...rest,
      description: typeof note === 'string' ? note : '',
      subtasks: [],
    });
    document = {
      ...document,
      schemaVersion: 8,
      tasks: eachRecord(document.tasks, withDetails),
      routines: eachRecord(document.routines, withDetails),
    };
  }

  return document.schemaVersion === SCHEMA_VERSION ? document : null;
}

const FRICTION_TAG_STARS = 3;
const PRIORITY_TAG_STARS = 2;

/** The stars that earn what version 6's tags earned. A damaged tag gives no stars, so the document is still refused. */
function starsFor(friction: unknown, priority: unknown): number | null {
  if (typeof friction !== 'boolean' || typeof priority !== 'boolean') return null;
  return (friction ? FRICTION_TAG_STARS : 0) + (priority ? PRIORITY_TAG_STARS : 0);
}

/**
 * A collection with `change` applied to each record. Anything that is not a record is left as
 * it is, for the checks to refuse.
 */
function eachRecord(collection: unknown, change: (record: Dict) => Dict): unknown {
  if (!isDict(collection)) return collection;
  const changed: Dict = {};
  for (const [id, record] of Object.entries(collection)) {
    changed[id] = isDict(record) ? change(record) : record;
  }
  return changed;
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
