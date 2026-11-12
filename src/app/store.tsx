import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState, ID } from '../data/model';
import { reduce, type Action, type ItemPatch } from '../data/reducer';
import { routineDays, routineWarmth, type ListItem } from '../data/selectors';
import type { StorageAdapter } from '../data/storage';
import type { HeatConfig } from '../heat/config';
import { addDays } from '../heat/day';
import { isScheduledOn } from '../heat/warmth';
import { clock, localDayKey } from './clock';

export interface AppStore {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  dispatch(action: Action): void;
}

export function createStore(initial: AppState): AppStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * What the screens can do. Each call stamps its own id and time, and works out anything
 * that depends on the HEAT config, which keeps the reducer pure.
 */
export interface Actions {
  addTask(title: string, areaId: ID | null): void;
  updateItem(item: ListItem, patch: ItemPatch): void;
  deleteItem(item: ListItem): void;
  /** Sets the weekdays an item repeats on. Any days make it a routine; none make it a one-off task. */
  setDays(item: ListItem, days: number[]): void;
  /** Returns the completion's id, which is what undo needs. */
  complete(item: ListItem): ID;
  undoCompletion(completionId: ID): void;
  addArea(name: string): void;
  renameArea(id: ID, name: string): void;
  deleteArea(id: ID): void;
  /** Sets a task aside from Today's suggestions for the rest of the day. */
  deferToday(taskId: ID): void;
  replaceState(state: AppState): void;
}

export function createActions(store: AppStore, config: HeatConfig): Actions {
  const newId = (): ID => crypto.randomUUID();
  const dayOf = (at: number) => localDayKey(at, config.dayStartHour);

  return {
    addTask: (title, areaId) => store.dispatch({ type: 'task/add', id: newId(), at: clock.touch(), title, areaId }),

    updateItem(item, patch) {
      const type = item.kind === 'task' ? 'task/update' : 'routine/update';
      store.dispatch({ type, id: item.id, at: clock.touch(), patch });
    },

    deleteItem(item) {
      const type = item.kind === 'task' ? 'task/delete' : 'routine/delete';
      store.dispatch({ type, id: item.id, at: clock.touch() });
    },

    setDays(item, days) {
      const at = clock.touch();
      const today = dayOf(at);
      const yesterday = addDays(today, -1);

      if (item.kind === 'task') {
        // A new routine starts cold, and today is its first day that can count.
        if (days.length > 0) store.dispatch({ type: 'task/makeRoutine', id: item.id, at, days, asOf: yesterday });
        return;
      }
      if (days.length === 0) return store.dispatch({ type: 'routine/makeTask', id: item.id, at });

      const state = store.getState();
      const routine = state.routines[item.id];
      if (!routine) return;
      // Settle everything up to yesterday under the old schedule; the new one applies from today.
      const earned = routineWarmth(routine, routineDays(state).get(routine.id), today, config);
      store.dispatch({ type: 'routine/setDays', id: routine.id, at, days, warmthBase: { ...earned, asOf: yesterday } });
    },

    complete(item) {
      const id = newId();
      const at = clock.touch();
      const dayKey = dayOf(at);

      if (item.kind === 'task') {
        store.dispatch({ type: 'task/complete', id, at, dayKey, taskId: item.id });
        return id;
      }

      const state = store.getState();
      const routine = state.routines[item.id];
      if (routine) {
        // Worked out here, not taken from the row, in case the day turned over since it was drawn.
        const { warmth } = routineWarmth(routine, routineDays(state).get(routine.id), dayKey, config);
        const scheduled = isScheduledOn(routine.schedule, dayKey);
        store.dispatch({ type: 'routine/complete', id, at, dayKey, routineId: routine.id, warmth, scheduled });
      }
      return id;
    },

    undoCompletion: (id) => store.dispatch({ type: 'completion/undo', id, at: clock.touch() }),
    addArea: (name) => store.dispatch({ type: 'area/add', id: newId(), at: clock.touch(), name }),
    renameArea: (id, name) => store.dispatch({ type: 'area/rename', id, at: clock.touch(), name }),
    deleteArea: (id) => store.dispatch({ type: 'area/delete', id, at: clock.touch() }),
    deferToday: (taskId) => store.dispatch({ type: 'today/defer', dayKey: dayOf(clock.touch()), taskId }),
    replaceState: (state) => store.dispatch({ type: 'state/replace', state }),
  };
}

const SAVE_DELAY_MS = 250;

/**
 * Saves after every change, a moment later so a burst of changes is one write, and at once
 * when the app is hidden or closed, because a phone may not give it another chance.
 */
export function persist(store: AppStore, storage: StorageAdapter): void {
  let timer: number | undefined;
  let dirty = false;

  const flush = () => {
    window.clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    storage.save(store.getState()).catch((error: unknown) => {
      dirty = true;
      console.error('HEAT could not save', error);
    });
  };

  store.subscribe(() => {
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

const StoreContext = createContext<{ store: AppStore; actions: Actions } | null>(null);

export function StoreProvider(props: { store: AppStore; actions: Actions; children: ReactNode }) {
  return (
    <StoreContext.Provider value={{ store: props.store, actions: props.actions }}>
      {props.children}
    </StoreContext.Provider>
  );
}

function useStoreContext() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('StoreProvider is missing');
  return context;
}

export function useAppState(): AppState {
  const { store } = useStoreContext();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useActions(): Actions {
  return useStoreContext().actions;
}
