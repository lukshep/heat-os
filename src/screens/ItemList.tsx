import { useEffect, useState, type ReactNode } from 'react';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { ID } from '../data/model';
import { placeLabel, priorityFirst, scorable, type ListItem } from '../data/selectors';
import type { DayKey } from '../heat/day';
import { pointsNow } from '../heat/engine';
import { ItemRow } from '../ui/ItemRow';
import { temperatureOf } from '../ui/temperature';

interface Props {
  items: readonly ListItem[];
  view: View;
  onComplete: (item: ListItem) => void;
  /** Opens an item's panel. */
  onEdit: (item: ListItem) => void;
  /** Say on each row where it lives. For lists that mix places. */
  showPlace?: boolean;
  /** Routines stay in this list once done for the day, shown as done. False on Today, where they leave. */
  routinesStay?: boolean;
  /** The day this list is for. Rows planned for it show only their time. */
  listDay?: DayKey;
  /** Whether a row can be done now. Rows that cannot are shown waiting. Every row can by default. */
  canComplete?: (item: ListItem) => boolean;
  trailing?: ((item: ListItem) => ReactNode) | undefined;
}

/**
 * A list of rows, each coloured by the points it would earn right now, Priority first. One row
 * shows its details at a time.
 */
export function ItemList(props: Props) {
  const { items, view, onComplete, onEdit, showPlace = false, routinesStay = false, listDay, canComplete, trailing } =
    props;
  const actions = useActions();
  const [openId, setOpenId] = useState<ID | null>(null);

  // Rows there when the list first appears come in with the screen. Any row that joins
  // afterwards, such as the next suggestion or one brought back by undo, eases in on its own.
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => setOnScreen(true), []);

  const waiting = (item: ListItem) => canComplete !== undefined && !canComplete(item);

  /** A routine already done, or not open yet, is worth nothing until it is open. */
  function temperature(item: ListItem): number {
    if (item.done || waiting(item)) return 0;
    return temperatureOf(pointsNow(view.heat, scorable(item), view.config), view.config);
  }

  return (
    <ul className="rows">
      {priorityFirst(items).map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          temperature={temperature(item)}
          today={view.today}
          listDay={listDay}
          open={openId === item.id}
          stays={routinesStay && item.kind === 'routine'}
          arrives={onScreen}
          waiting={waiting(item)}
          onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          onComplete={() => onComplete(item)}
          onUndo={() => item.undoId !== null && actions.undoCompletion(item.undoId)}
          onEdit={() => onEdit(item)}
          onToggleSubtask={(subtaskId) => actions.toggleSubtask(item, subtaskId)}
          context={showPlace ? placeLabel(view.places, item) : undefined}
          trailing={trailing?.(item)}
        />
      ))}
    </ul>
  );
}
