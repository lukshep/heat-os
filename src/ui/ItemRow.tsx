import { useState, type CSSProperties, type ReactNode } from 'react';
import type { ItemPatch } from '../data/reducer';
import type { ListItem, Place } from '../data/selectors';
import { CheckIcon } from './icons';
import { heatColor } from './temperature';
import { describeDays, weekdayName, weekdayOrder } from './weekdays';

interface Props {
  item: ListItem;
  /** 0 (cold) to 1 (hottest): how much HEAT completing it would add right now. */
  temperature: number;
  /** Every area and project, for choosing where the item lives. */
  places: readonly Place[];
  open: boolean;
  /** The row stays in its list once completed, so it must not fold away. True for a routine outside Today. */
  stays: boolean;
  /** The row joined a list that was already on screen, so it should ease in. Read once, when it appears. */
  arrives: boolean;
  onToggle: () => void;
  onComplete: () => void;
  /** Takes back today's completion of a routine that is shown as done. */
  onUndo: () => void;
  onUpdate: (patch: ItemPatch) => void;
  /** Sets the weekdays it repeats on. Any days make it a routine; none make it a one-off task. */
  onSetDays: (days: number[]) => void;
  onDelete: () => void;
  /** Where the item lives, shown on screens that mix areas. */
  context?: string | undefined;
  trailing?: ReactNode;
}

/** How long the row takes to fill and fold away before the completion is recorded. */
const LEAVE_MS = 260;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ItemRow(props: Props) {
  const { item, temperature, open, context } = props;
  const [leaving, setLeaving] = useState(false);
  // Fixed at the moment the row appears, so a later re-render cannot cut the animation short.
  const [arrived] = useState(props.arrives);
  const done = item.doneCompletionId !== null;

  function complete() {
    if (leaving) return;
    if (props.stays || prefersReducedMotion()) return props.onComplete();
    setLeaving(true);
    window.setTimeout(props.onComplete, LEAVE_MS);
  }

  const meta = [
    context,
    item.kind === 'routine' && describeDays(item.days),
    item.important && 'Important',
    item.avoided && 'Avoided',
  ].filter(Boolean);

  const className = ['row', arrived && 'is-entering', leaving && 'is-leaving', done && 'is-done']
    .filter(Boolean)
    .join(' ');
  const style = { '--temp': heatColor(temperature), '--glow': temperature.toFixed(3) } as CSSProperties;

  return (
    <li className={className} style={style}>
      <div className="row-inner">
        <div className="row-main">
          <button
            className="row-check"
            type="button"
            aria-label={done ? `Undo: ${item.title}` : `Complete: ${item.title}`}
            onClick={done ? props.onUndo : complete}
          >
            <span className="row-check-ring">{done && <CheckIcon />}</span>
          </button>
          <button className="row-title" type="button" aria-expanded={open} onClick={props.onToggle}>
            <span className="row-title-text">{item.title}</span>
            {meta.length > 0 && <span className="row-meta">{meta.join(' · ')}</span>}
          </button>
          {props.trailing}
        </div>
        {open && <Editor {...props} />}
      </div>
    </li>
  );
}

const INBOX = 'inbox';

/** The value of the "Keep it in" picker that stands for where the item is now. */
function homeKey(item: ListItem): string {
  if (item.areaId === null) return INBOX;
  return item.projectId === null ? `area:${item.areaId}` : `project:${item.projectId}`;
}

function Editor({ item, places, onUpdate, onSetDays, onDelete }: Props) {
  const [title, setTitle] = useState(item.title);

  function commitTitle() {
    const next = title.trim();
    if (next && next !== item.title) onUpdate({ title: next });
    else setTitle(item.title);
  }

  function toggleDay(day: number) {
    onSetDays(item.days.includes(day) ? item.days.filter((other) => other !== day) : [...item.days, day]);
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
          aria-label="Title"
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>

      <div className="chips" role="group" aria-label="Flags">
        <Chip pressed={item.important} onClick={() => onUpdate({ important: !item.important })}>
          Important
        </Chip>
        <Chip pressed={item.avoided} onClick={() => onUpdate({ avoided: !item.avoided })}>
          Avoided
        </Chip>
      </div>

      <label>
        <div className="editor-label">Keep it in</div>
        {/* A native picker: it copes with any number of areas and projects, at any depth. */}
        <select
          value={homeKey(item)}
          onChange={(event) => {
            const place = places.find((candidate) => candidate.key === event.target.value);
            onUpdate(place ? { areaId: place.areaId, projectId: place.projectId } : { areaId: null, projectId: null });
          }}
        >
          {/* A routine needs a home, so only a one-off task can go back to the Inbox. */}
          {item.kind === 'task' && <option value={INBOX}>Inbox</option>}
          {places.map((place) => (
            <option key={place.key} value={place.key}>
              {place.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="editor-label">Repeat on</div>
        {item.areaId === null ? (
          <p className="editor-hint">File it under an area first, then it can repeat.</p>
        ) : (
          <div className="chips" role="group" aria-label="Repeat on">
            {weekdayOrder().map((day) => (
              <Chip key={day} pressed={item.days.includes(day)} onClick={() => toggleDay(day)}>
                {weekdayName(day)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <button className="text-button is-danger" type="button" onClick={onDelete}>
        Delete {item.kind}
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
