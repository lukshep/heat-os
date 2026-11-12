import { useMemo } from 'react';
import type { AppState } from '../data/model';
import { listItems, liveCompletions, places, type ListItem, type Place } from '../data/selectors';
import { DEFAULT_CONFIG, type HeatConfig } from '../heat/config';
import type { DayKey } from '../heat/day';
import { foldHeat, type HeatState } from '../heat/engine';
import { localDayKey, useNow } from './clock';
import { useAppState } from './store';

/** Everything a screen needs, worked out once per change so every screen agrees. */
export interface View {
  state: AppState;
  config: HeatConfig;
  today: DayKey;
  /** HEAT right now, plus what is needed to price the next completion. */
  heat: HeatState;
  /** Every routine, then every task still to do, each oldest first. */
  items: ListItem[];
  /** Every area and project, flattened in reading order. */
  places: Place[];
}

export function useView(): View {
  const config = DEFAULT_CONFIG;
  const state = useAppState();
  const now = useNow();
  const today = localDayKey(now, config.dayStartHour);

  const heat = useMemo(() => foldHeat(liveCompletions(state), config, now, today), [state, config, now, today]);
  const items = useMemo(() => listItems(state, today, config), [state, today, config]);
  const allPlaces = useMemo(() => places(state), [state]);

  return { state, config, today, heat, items, places: allPlaces };
}
