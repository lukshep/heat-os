import { useSyncExternalStore } from 'react';
import { dayKeyAt, type DayKey } from '../heat/day';

/**
 * The app's one source of "now". The engine never reads the clock itself; screens read this
 * and pass the time in. It moves once a minute, whenever the app comes back into view, and
 * whenever something is done, so a completion is never ahead of the time it is judged at.
 */
let current = Date.now();
const listeners = new Set<() => void>();

export const clock = {
  now(): number {
    return current;
  },
  /** Moves the clock to the present and returns it. */
  touch(): number {
    current = Date.now();
    for (const listener of listeners) listener();
    return current;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const TICK_MS = 60_000;

export function startClock(): void {
  window.setInterval(clock.touch, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clock.touch();
  });
}

export function useNow(): number {
  return useSyncExternalStore(clock.subscribe, clock.now);
}

/** The day an instant belongs to on this device's clock. */
export function localDayKey(at: number, dayStartHour: number): DayKey {
  return dayKeyAt(at, dayStartHour, -new Date(at).getTimezoneOffset());
}
