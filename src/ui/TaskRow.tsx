import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Area, Task } from '../data/model';
import type { TaskPatch } from '../data/reducer';
import { heatColor } from './temperature';

interface Props {
  task: Task;
  /** 0 (cold) to 1 (hottest): how much HEAT completing it would add right now. */
  temperature: number;
  areas: readonly Area[];
  open: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onUpdate: (patch: TaskPatch) => void;
  onDelete: () => void;
  /** Where the task lives, shown on screens that mix areas. */
  context?: string | undefined;
  trailing?: ReactNode;
}

/** How long the row takes to fill and fold away before the completion is recorded. */
const LEAVE_MS = 260;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TaskRow(props: Props) {
  const { task, temperature, open, context } = props;
  const [leaving, setLeaving] = useState(false);

  function complete() {
    if (leaving) return;
    if (prefersReducedMotion()) return props.onComplete();
    setLeaving(true);
    window.setTimeout(props.onComplete, LEAVE_MS);
  }

  const meta = [context, task.important && 'Important', task.avoided && 'Avoided'].filter(Boolean);
  const style = { '--temp': heatColor(temperature), '--glow': temperature.toFixed(3) } as CSSProperties;

  return (
    <li className={leaving ? 'row is-leaving' : 'row'} style={style}>
      <div className="row-inner">
        <div className="row-main">
          <button className="row-check" type="button" aria-label={`Complete: ${task.title}`} onClick={complete}>
            <span className="row-check-ring" />
          </button>
          <button className="row-title" type="button" aria-expanded={open} onClick={props.onToggle}>
            <span className="row-title-text">{task.title}</span>
            {meta.length > 0 && <span className="row-meta">{meta.join(' · ')}</span>}
          </button>
          {props.trailing}
        </div>
        {open && <Editor {...props} />}
      </div>
    </li>
  );
}

function Editor({ task, areas, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(task.title);

  function commitTitle() {
    const next = title.trim();
    if (next && next !== task.title) onUpdate({ title: next });
    else setTitle(task.title);
  }

  return (
    <div className="editor">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Leaving the field is what saves, so Return and tapping away behave the same.
          event.currentTarget.querySelector('input')?.blur();
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          aria-label="Task title"
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>

      <div className="chips" role="group" aria-label="Flags">
        <Chip pressed={task.important} onClick={() => onUpdate({ important: !task.important })}>
          Important
        </Chip>
        <Chip pressed={task.avoided} onClick={() => onUpdate({ avoided: !task.avoided })}>
          Avoided
        </Chip>
      </div>

      <div>
        <div className="editor-label">Keep it in</div>
        <div className="chips" role="group" aria-label="Keep it in">
          <Chip pressed={task.areaId === null} onClick={() => onUpdate({ areaId: null })}>
            Inbox
          </Chip>
          {areas.map((area) => (
            <Chip key={area.id} pressed={task.areaId === area.id} onClick={() => onUpdate({ areaId: area.id })}>
              {area.name}
            </Chip>
          ))}
        </div>
      </div>

      <button className="text-button is-danger" type="button" onClick={onDelete}>
        Delete task
      </button>
    </div>
  );
}

function Chip(props: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="chip" type="button" aria-pressed={props.pressed} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
