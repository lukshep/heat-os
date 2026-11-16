import { useState, type CSSProperties, type ReactNode } from 'react';
import type { ItemPatch } from '../data/reducer';
import type { ListItem, Place } from '../data/selectors';
import { LAST_DAY, type Schedule } from '../heat/schedule';
import { CheckIcon } from './icons';
import { heatColor } from './temperature';
import { describeSchedule, monthDayName, weekdayName, weekdayOrder } from './weekdays';

interface Props {
  item: ListItem;
  /** 0 (cold) to 1 (hottest): how many points completing it would earn right now, whatever HEAT is. */
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
  /** Sets how it repeats. Any days make it a routine; none make it a one-off task. */
  onSetSchedule: (schedule: Schedule) => void;
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
  const { done } = item;
  // Only a completion made today can be taken back from the row.
  const undoable = item.undoId !== null;

  function complete() {
    if (leaving) return;
    if (props.stays || prefersReducedMotion()) return props.onComplete();
    setLeaving(true);
    window.setTimeout(props.onComplete, LEAVE_MS);
  }

  const meta = [
    context,
    item.repeat && describeSchedule(item.repeat),
    item.priority && 'Priority',
    item.friction && 'Friction',
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
            aria-label={done ? (undoable ? `Undo: ${item.title}` : `Done: ${item.title}`) : `Complete: ${item.title}`}
            disabled={done && !undoable}
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

/**
 * The days the monthly picker offers before Last day. The 31st is left out: a day a month lacks
 * falls on its last day, so the 31st and Last day are the same thing.
 */
const MONTH_DAYS = Array.from({ length: LAST_DAY - 1 }, (_, index) => index + 1);

/** The value of the "Keep it in" picker that stands for where the item is now. */
function homeKey(item: ListItem): string {
  if (item.areaId === null) return INBOX;
  return item.projectId === null ? `area:${item.areaId}` : `project:${item.projectId}`;
}

function Editor({ item, places, onUpdate, onSetSchedule, onDelete }: Props) {
  const [title, setTitle] = useState(item.title);
  // Which picker is showing. Switching it changes nothing until a day is chosen in it.
  const [every, setEvery] = useState<Schedule['every']>(item.repeat?.every ?? 'week');
  const chosen = item.repeat?.every === every ? item.repeat.days : [];

  function commitTitle() {
    const next = title.trim();
    if (next && next !== item.title) onUpdate({ title: next });
    else setTitle(item.title);
  }

  /** The first day chosen makes it a routine, and clearing the last makes it a one-off task. */
  function toggleDay(day: number) {
    const days = chosen.includes(day) ? chosen.filter((other) => other !== day) : [...chosen, day];
    onSetSchedule({ every, days });
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

      <div className="chips" role="group" aria-label="Tags">
        <Chip pressed={item.priority} onClick={() => onUpdate({ priority: !item.priority })}>
          Priority
        </Chip>
        <Chip pressed={item.friction} onClick={() => onUpdate({ friction: !item.friction })}>
          Friction
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
        <div className="editor-label">Repeat</div>
        {item.areaId === null ? (
          <p className="editor-hint">File it under an area first, then it can repeat.</p>
        ) : (
          <div className="repeat">
            <div className="chips" role="group" aria-label="How often">
              <Chip pressed={every === 'week'} onClick={() => setEvery('week')}>
                Weekly
              </Chip>
              <Chip pressed={every === 'month'} onClick={() => setEvery('month')}>
                Monthly
              </Chip>
            </div>
            {every === 'week' ? (
              <div className="chips" role="group" aria-label="Repeat on weekdays">
                {weekdayOrder().map((day) => (
                  <Chip key={day} pressed={chosen.includes(day)} onClick={() => toggleDay(day)}>
                    {weekdayName(day)}
                  </Chip>
                ))}
              </div>
            ) : (
              <div className="month-days" role="group" aria-label="Repeat on days of the month">
                {MONTH_DAYS.map((day) => (
                  <Chip
                    key={day}
                    pressed={chosen.includes(day)}
                    onClick={() => toggleDay(day)}
                    label={monthDayName(day)}
                  >
                    {day}
                  </Chip>
                ))}
                <Chip pressed={chosen.includes(LAST_DAY)} onClick={() => toggleDay(LAST_DAY)} wide>
                  {monthDayName(LAST_DAY)}
                </Chip>
              </div>
            )}
          </div>
        )}
      </div>

      <button className="text-button is-danger" type="button" onClick={onDelete}>
        Delete {item.kind}
      </button>
    </div>
  );
}

interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  /** A spoken name, for a chip whose text alone says too little, such as a bare day number. */
  label?: string;
  /** Takes a whole row of a grid. */
  wide?: boolean;
}

function Chip(props: ChipProps) {
  return (
    <button
      className={props.wide ? 'chip is-wide' : 'chip'}
      type="button"
      aria-pressed={props.pressed}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
