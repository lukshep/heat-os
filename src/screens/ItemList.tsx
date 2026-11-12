import { useState, type ReactNode } from 'react';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { ID } from '../data/model';
import { scorable, type ListItem } from '../data/selectors';
import { gainFor } from '../heat/engine';
import { ItemRow } from '../ui/ItemRow';
import { temperatureOf } from '../ui/temperature';

interface Props {
  items: readonly ListItem[];
  view: View;
  onComplete: (item: ListItem) => void;
  /** Name the area on each row. For lists that mix areas. */
  showArea?: boolean;
  /** Routines stay in this list once done for the day, shown as done. False on Today, where they leave. */
  routinesStay?: boolean;
  trailing?: ((item: ListItem) => ReactNode) | undefined;
}

/** A list of rows, each coloured by the HEAT it would add right now. One row opens at a time. */
export function ItemList({ items, view, onComplete, showArea = false, routinesStay = false, trailing }: Props) {
  const actions = useActions();
  const [openId, setOpenId] = useState<ID | null>(null);

  function areaName(item: ListItem): string {
    return view.areas.find((area) => area.id === item.areaId)?.name ?? 'Inbox';
  }

  /** A routine already done today is worth nothing more until tomorrow. */
  function temperature(item: ListItem): number {
    if (item.doneCompletionId !== null) return 0;
    return temperatureOf(gainFor(view.heat, scorable(item), view.config), view.config);
  }

  return (
    <ul className="rows">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          temperature={temperature(item)}
          areas={view.areas}
          open={openId === item.id}
          stays={routinesStay && item.kind === 'routine'}
          onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          onComplete={() => onComplete(item)}
          onUndo={() => item.doneCompletionId !== null && actions.undoCompletion(item.doneCompletionId)}
          onUpdate={(patch) => actions.updateItem(item, patch)}
          onSetDays={(days) => actions.setDays(item, days)}
          onDelete={() => actions.deleteItem(item)}
          context={showArea ? areaName(item) : undefined}
          trailing={trailing?.(item)}
        />
      ))}
    </ul>
  );
}
