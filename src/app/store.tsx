import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState, ID } from '../data/model';
import { reduce, type Action, type TaskPatch } from '../data/reducer';
import type { StorageAdapter } from '../data/storage';
import type { HeatConfig } from '../heat/config';
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

/** What the screens can do. Each call stamps its own id and time, which keeps the reducer pure. */
export interface Actions {
  addTask(title: string, areaId: ID | null): void;
  updateTask(id: ID, patch: TaskPatch): void;
  deleteTask(id: ID): void;
  /** Returns the completion's id, which is what undo needs. */
  completeTask(taskId: ID): ID;
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
  return {
    addTask: (title, areaId) => store.dispatch({ type: 'task/add', id: newId(), at: clock.touch(), title, areaId }),
    updateTask: (id, patch) => store.dispatch({ type: 'task/update', id, at: clock.touch(), patch }),
    deleteTask: (id) => store.dispatch({ type: 'task/delete', id, at: clock.touch() }),
    completeTask(taskId) {
      const id = newId();
      const at = clock.touch();
      store.dispatch({ type: 'task/complete', id, at, dayKey: localDayKey(at, config.dayStartHour), taskId });
      return id;
    },
    undoCompletion: (id) => store.dispatch({ type: 'completion/undo', id, at: clock.touch() }),
    addArea: (name) => store.dispatch({ type: 'area/add', id: newId(), at: clock.touch(), name }),
    renameArea: (id, name) => store.dispatch({ type: 'area/rename', id, at: clock.touch(), name }),
    deleteArea: (id) => store.dispatch({ type: 'area/delete', id, at: clock.touch() }),
    deferToday(taskId) {
      const dayKey = localDayKey(clock.touch(), config.dayStartHour);
      store.dispatch({ type: 'today/defer', dayKey, taskId });
    },
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
