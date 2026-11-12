import { useState, type ReactNode } from 'react';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { ID, Task } from '../data/model';
import { scorable } from '../data/selectors';
import { gainFor } from '../heat/engine';
import { TaskRow } from '../ui/TaskRow';
import { temperatureOf } from '../ui/temperature';

interface Props {
  tasks: readonly Task[];
  view: View;
  onComplete: (task: Task) => void;
  /** Name the area on each row. For lists that mix areas. */
  showArea?: boolean;
  trailing?: ((task: Task) => ReactNode) | undefined;
}

/** A list of task rows, each coloured by the HEAT it would add right now. One row opens at a time. */
export function TaskList({ tasks, view, onComplete, showArea = false, trailing }: Props) {
  const actions = useActions();
  const [openId, setOpenId] = useState<ID | null>(null);

  function areaName(task: Task): string {
    return view.areas.find((area) => area.id === task.areaId)?.name ?? 'Inbox';
  }

  return (
    <ul className="rows">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          temperature={temperatureOf(gainFor(view.heat, scorable(task), view.config), view.config)}
          areas={view.areas}
          open={openId === task.id}
          onToggle={() => setOpenId(openId === task.id ? null : task.id)}
          onComplete={() => onComplete(task)}
          onUpdate={(patch) => actions.updateTask(task.id, patch)}
          onDelete={() => actions.deleteTask(task.id)}
          context={showArea ? areaName(task) : undefined}
          trailing={trailing?.(task)}
        />
      ))}
    </ul>
  );
}
