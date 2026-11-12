import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { Task } from '../data/model';
import { candidate, deferredToday } from '../data/selectors';
import { suggest } from '../heat/suggest';
import { SwapIcon } from '../ui/icons';
import { TaskList } from './TaskList';

interface Props {
  view: View;
  onComplete: (task: Task) => void;
}

/** How many tasks Today offers at once. Finishing or swapping one brings in the next. */
const SUGGESTION_COUNT = 5;

export function Today({ view, onComplete }: Props) {
  const actions = useActions();
  const setAside = deferredToday(view.state, view.today);
  const pool = view.tasks.filter((task) => !setAside.has(task.id)).map(candidate);
  const picks = suggest(pool, view.heat, view.config, SUGGESTION_COUNT).map((pick) => pick.task);
  const canSwap = pool.length > picks.length;

  if (picks.length === 0) {
    return (
      <p className="empty">
        {view.tasks.length === 0
          ? 'Nothing to do yet. Capture a task with the plus button.'
          : 'Nothing else to suggest today. Everything is still in Projects and Inbox.'}
      </p>
    );
  }

  return (
    <TaskList
      tasks={picks}
      view={view}
      onComplete={onComplete}
      showArea
      trailing={
        canSwap
          ? (task) => (
              <button
                className="row-swap"
                type="button"
                aria-label={`Swap for another suggestion: ${task.title}`}
                onClick={() => actions.deferToday(task.id)}
              >
                <SwapIcon />
              </button>
            )
          : undefined
      }
    />
  );
}
