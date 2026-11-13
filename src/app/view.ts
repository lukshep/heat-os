import { useMemo } from 'react';
import type { AppState } from '../data/model';
import { heatCompletions, heatConfig, heatTimeline, listItems, places, type ListItem, type Place } from '../data/selectors';
import type { HeatConfig } from '../heat/config';
import type { DayKey } from '../heat/day';
import { foldHeat, type HeatState } from '../heat/engine';
import { localDayKey, useNow } from './clock';
import { useAppState } from './store';

/** Everything a screen needs, worked out once per change so every screen agrees. */
export interface View {
  state: AppState;
  /** The config in force now: the tuned defaults with this person's own day start, Effort and Cooling. */
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
  const state = useAppState();
  const config = useMemo(() => heatConfig(state.settings), [state.settings]);
  const timeline = useMemo(() => heatTimeline(state.settings), [state.settings]);
  const now = useNow();
  const today = localDayKey(now, config.dayStartHour);

  const heat = useMemo(() => foldHeat(heatCompletions(state), timeline, now, today), [state, timeline, now, today]);
  const items = useMemo(() => listItems(state, today, config), [state, today, config]);
  const allPlaces = useMemo(() => places(state), [state]);

  return { state, config, today, heat, items, places: allPlaces };
}
