import { useActions } from '../app/store';
import type { View } from '../app/view';
import { candidate, deferredToday, type ListItem } from '../data/selectors';
import { suggest } from '../heat/suggest';
import { SwapIcon } from '../ui/icons';
import { ItemList } from './ItemList';

interface Props {
  view: View;
  onComplete: (item: ListItem) => void;
}

/** How many tasks Today offers at once. Finishing or swapping one brings in the next. */
const SUGGESTION_COUNT = 5;

export function Today({ view, onComplete }: Props) {
  const actions = useActions();

  // Every routine due today comes first, in the same order each day. They cannot be swapped away.
  const routines = view.items.filter(
    (item) => item.kind === 'routine' && item.dueToday && item.doneCompletionId === null,
  );

  const setAside = deferredToday(view.state, view.today);
  const pool = view.items.filter((item) => item.kind === 'task' && !setAside.has(item.id)).map(candidate);
  const picks = suggest(pool, view.heat, view.config, SUGGESTION_COUNT).map((pick) => pick.item);
  const canSwap = pool.length > picks.length;

  if (routines.length + picks.length === 0) {
    return (
      <p className="empty">
        {view.items.length === 0
          ? 'Nothing to do yet. Capture a task with the plus button.'
          : 'Nothing else to suggest today. Everything is still in Projects and Inbox.'}
      </p>
    );
  }

  return (
    <ItemList
      items={[...routines, ...picks]}
      view={view}
      onComplete={onComplete}
      showArea
      trailing={(item) =>
        item.kind === 'task' && canSwap ? (
          <button
            className="row-swap"
            type="button"
            aria-label={`Swap for another suggestion: ${item.title}`}
            onClick={() => actions.deferToday(item.id)}
          >
            <SwapIcon />
          </button>
        ) : undefined
      }
    />
  );
}
