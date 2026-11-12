import type { Ref } from 'react';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { Task } from '../data/model';
import { tasksIn } from '../data/selectors';
import { AddInput } from '../ui/AddInput';
import { TaskList } from './TaskList';

interface Props {
  view: View;
  onComplete: (task: Task) => void;
  /** The capture field, so the plus button can put the cursor in it. */
  captureRef: Ref<HTMLInputElement>;
}

export function Inbox({ view, onComplete, captureRef }: Props) {
  const actions = useActions();
  // Newest first, so what was just captured appears right under the field.
  const unfiled = tasksIn(view.tasks, null).reverse();

  return (
    <>
      <AddInput
        prominent
        placeholder="Capture a task"
        inputRef={captureRef}
        onAdd={(title) => actions.addTask(title, null)}
      />
      {unfiled.length > 0 ? (
        <TaskList tasks={unfiled} view={view} onComplete={onComplete} />
      ) : (
        <p className="empty">Nothing waiting. What you capture lands here until you file it.</p>
      )}
    </>
  );
}
