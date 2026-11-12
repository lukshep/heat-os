import type { Ref } from 'react';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { inArea, type ListItem } from '../data/selectors';
import { AddInput } from '../ui/AddInput';
import { ItemList } from './ItemList';

interface Props {
  view: View;
  onComplete: (item: ListItem) => void;
  /** The capture field, so the plus button can put the cursor in it. */
  captureRef: Ref<HTMLInputElement>;
}

export function Inbox({ view, onComplete, captureRef }: Props) {
  const actions = useActions();
  // Newest first, so what was just captured appears right under the field.
  const unfiled = inArea(view.items, null).reverse();

  return (
    <>
      <AddInput
        prominent
        placeholder="Capture a task"
        inputRef={captureRef}
        onAdd={(title) => actions.addTask(title, null)}
      />
      {unfiled.length > 0 ? (
        <ItemList items={unfiled} view={view} onComplete={onComplete} />
      ) : (
        <p className="empty">Nothing waiting. What you capture lands here until you file it.</p>
      )}
    </>
  );
}
