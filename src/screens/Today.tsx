import { useActions } from '../app/store';
import type { View } from '../app/view';
import { candidate, deferredToday, planToday, type ListItem } from '../data/selectors';
import { suggest } from '../heat/suggest';
import { SwapIcon } from '../ui/icons';
import { ItemList } from './ItemList';

interface Props {
  view: View;
  onComplete: (item: ListItem) => void;
}

/**
 * How many tasks Today lists at once. Tasks planned for today take the places first and
 * suggestions fill the rest. Finishing or swapping a suggestion brings in the next.
 */
const SUGGESTION_COUNT = 5;

export function Today({ view, onComplete }: Props) {
  const actions = useActions();

  // What is settled for today comes first: anything with a time, then routines that are due,
  // then tasks planned for today or before. None of it can be swapped away.
  const plan = planToday(view.items, view.today, view.config.dayStartHour);

  const setAside = deferredToday(view.state, view.today);
  const pool = plan.undated.filter((item) => !setAside.has(item.id)).map(candidate);
  const room = Math.max(0, SUGGESTION_COUNT - plan.plannedTasks);
  const picks = suggest(pool, view.heat, view.config, room).map((pick) => pick.item);
  const swappable = new Set(picks.map((pick) => pick.id));
  const canSwap = pool.length > picks.length;

  if (plan.settled.length + picks.length === 0) {
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
      items={[...plan.settled, ...picks]}
      view={view}
      onComplete={onComplete}
      showPlace
      listDay={view.today}
      trailing={(item) =>
        swappable.has(item.id) && canSwap ? (
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
