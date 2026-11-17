import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ID } from '../data/model';
import type { ItemPatch } from '../data/reducer';
import type { ListItem, ListSubtask, Place } from '../data/selectors';
import { FRICTION_STARS } from '../heat/config';
import { addDays, isDayKey, type DayKey } from '../heat/day';
import { DAILY, isDaily, LAST_DAY, type Schedule } from '../heat/schedule';
import { AddInput } from './AddInput';
import { dayName } from './dates';
import { CheckIcon, CloseIcon, StarIcon } from './icons';
import { monthDayName, weekdayName, weekdayOrder } from './weekdays';

interface Props {
  item: ListItem;
  /** Every area and project, for choosing where the item lives. */
  places: readonly Place[];
  today: DayKey;
  onClose: () => void;
  onUpdate: (patch: ItemPatch) => void;
  /** Sets how it repeats. Any days make it a routine; none make it a one-off task. */
  onSetSchedule: (schedule: Schedule) => void;
  onDelete: () => void;
  onAddSubtask: (title: string) => void;
  onRenameSubtask: (id: ID, title: string) => void;
  onDeleteSubtask: (id: ID) => void;
  onToggleSubtask: (id: ID) => void;
}

/**
 * The panel for one task or routine: its title, description and subtasks, then how it is
 * tagged, planned, filed and repeated. It rises from the bottom, under the edge line, which
 * stays in view over it. Every change is saved as it is made, so it only needs closing.
 */
export function ItemSheet(props: Props) {
  const { item, onClose } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  // The scrim closes the panel only for a tap that starts on it. A long press opens the panel
  // under the finger, and the finger then lifts over the scrim.
  const pressedScrim = useRef(false);

  // Take focus, so a keyboard and a screen reader start in the panel, and give it back on closing.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="sheet-layer">
      <div
        className="sheet-scrim"
        onPointerDown={() => (pressedScrim.current = true)}
        onClick={() => {
          if (pressedScrim.current) onClose();
          pressedScrim.current = false;
        }}
      />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onClose();
        }}
      >
        <div className="sheet-head">
          {/* Repeat can turn one into the other while the panel is open, so it says which it is now. */}
          <span className="sheet-kind">{item.kind === 'task' ? 'Task' : 'Routine'}</span>
          <button className="text-button sheet-done" type="button" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <Editor {...props} />
        </div>
      </div>
    </div>
  );
}

/**
 * The text of a field while it is edited. Leaving the field saves it, and so does closing the
 * panel with the cursor still in it, which a phone can do without the field ever being left.
 * Space at either end is dropped. A field that cannot be empty goes back to its saved text.
 */
function useDraft(saved: string, save: (text: string) => void, canBeEmpty = false) {
  const [text, setText] = useState(saved);
  const latest = useRef({ text, saved, save });
  latest.current = { text, saved, save };

  const keeps = (next: string, was: string) => next !== was && (canBeEmpty || next !== '');

  useEffect(
    () => () => {
      const { text: last, saved: was, save: keep } = latest.current;
      if (keeps(last.trim(), was)) keep(last.trim());
    },
    // Once, on closing. `keeps` reads only `canBeEmpty`, which a field never changes.
    [],
  );

  function commit() {
    const next = text.trim();
    if (keeps(next, saved)) {
      save(next);
      setText(next);
    } else {
      setText(saved);
    }
  }

  return { text, setText, commit };
}

const INBOX = 'inbox';

/**
 * The days the monthly picker offers before Last day. The 31st is left out: a day a month lacks
 * falls on its last day, so the 31st and Last day are the same thing.
 */
const MONTH_DAYS = Array.from({ length: LAST_DAY - 1 }, (_, index) => index + 1);

/** Which repeat picker is showing: Daily has no days to choose, so it is a picker of its own. */
type Repeat = 'day' | Schedule['every'];

/** The picker that shows how an item repeats now. A one-off task starts on Weekly, one tap from a routine. */
function repeatOf(schedule: Schedule | null): Repeat {
  if (schedule === null) return 'week';
  return isDaily(schedule) ? 'day' : schedule.every;
}

/** The value of the "Keep it in" picker that stands for where the item is now. */
function homeKey(item: ListItem): string {
  if (item.areaId === null) return INBOX;
  return item.projectId === null ? `area:${item.areaId}` : `project:${item.projectId}`;
}

function Editor({ item, places, today, onUpdate, onSetSchedule, onDelete, ...subtasks }: Props) {
  const title = useDraft(item.title, (text) => onUpdate({ title: text }));
  // Which picker is showing. Daily applies at once; Weekly and Monthly change nothing until a day is chosen.
  const [every, setEvery] = useState<Repeat>(() => repeatOf(item.repeat));
  const chosen = item.repeat?.every === every ? item.repeat.days : [];

  /** The first day chosen makes it a routine, and clearing the last makes it a one-off task. */
  function toggleDay(every: Schedule['every'], day: number) {
    const days = chosen.includes(day) ? chosen.filter((other) => other !== day) : [...chosen, day];
    onSetSchedule({ every, days });
  }

  function repeatDaily() {
    setEvery('day');
    if (item.repeat === null || !isDaily(item.repeat)) onSetSchedule(DAILY);
  }

  /** Makes it a one-off task again, without unticking each of its days. */
  function stopRepeating() {
    if (item.repeat === null) return;
    setEvery('week');
    onSetSchedule({ every: item.repeat.every, days: [] });
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
          className="sheet-title"
          value={title.text}
          onChange={(event) => title.setText(event.target.value)}
          onBlur={title.commit}
          aria-label="Title"
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>

      <Description saved={item.description} onSave={(description) => onUpdate({ description })} />

      <Subtasks item={item} {...subtasks} />

      <div className="tags">
        <Chip pressed={item.priority} onClick={() => onUpdate({ priority: !item.priority })}>
          Priority
        </Chip>
        <FrictionPicker stars={item.friction} onChange={(friction) => onUpdate({ friction })} />
      </div>

      <When item={item} today={today} onUpdate={onUpdate} />

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
              <Chip pressed={every === 'day'} onClick={repeatDaily}>
                Daily
              </Chip>
              <Chip pressed={every === 'week'} onClick={() => setEvery('week')}>
                Weekly
              </Chip>
              <Chip pressed={every === 'month'} onClick={() => setEvery('month')}>
                Monthly
              </Chip>
            </div>
            {every === 'week' && (
              <div className="chips" role="group" aria-label="Repeat on weekdays">
                {weekdayOrder().map((day) => (
                  <Chip key={day} pressed={chosen.includes(day)} onClick={() => toggleDay('week', day)}>
                    {weekdayName(day)}
                  </Chip>
                ))}
              </div>
            )}
            {every === 'month' && (
              <div className="month-days" role="group" aria-label="Repeat on days of the month">
                {MONTH_DAYS.map((day) => (
                  <Chip
                    key={day}
                    pressed={chosen.includes(day)}
                    onClick={() => toggleDay('month', day)}
                    label={monthDayName(day)}
                  >
                    {day}
                  </Chip>
                ))}
                <Chip pressed={chosen.includes(LAST_DAY)} onClick={() => toggleDay('month', LAST_DAY)} wide>
                  {monthDayName(LAST_DAY)}
                </Chip>
              </div>
            )}
            {item.repeat !== null && (
              <button className="text-button" type="button" onClick={stopRepeating}>
                Stop repeating
              </button>
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

/** Plain text, as long as it needs to be. The field grows with what is written in it. */
function Description({ saved, onSave }: { saved: string; onSave: (text: string) => void }) {
  const draft = useDraft(saved, onSave, true);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    // The height includes the border, which scrollHeight leaves out.
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, [draft.text]);

  return (
    <label>
      <div className="editor-label">Description</div>
      <textarea
        ref={fieldRef}
        className="sheet-description"
        value={draft.text}
        onChange={(event) => draft.setText(event.target.value)}
        onBlur={draft.commit}
        rows={2}
        autoCapitalize="sentences"
      />
    </label>
  );
}

type SubtaskProps = Pick<Props, 'item' | 'onAddSubtask' | 'onRenameSubtask' | 'onDeleteSubtask' | 'onToggleSubtask'>;

/** Subtasks in order, each to tick, rename or take out, and a field for the next. They earn nothing. */
function Subtasks({ item, onAddSubtask, onRenameSubtask, onDeleteSubtask, onToggleSubtask }: SubtaskProps) {
  return (
    <div>
      <div className="editor-label">Subtasks</div>
      {item.subtasks.length > 0 && (
        <ul className="sheet-subtasks">
          {item.subtasks.map((subtask) => (
            <SubtaskField
              key={subtask.id}
              subtask={subtask}
              onToggle={() => onToggleSubtask(subtask.id)}
              onRename={(title) => onRenameSubtask(subtask.id, title)}
              onDelete={() => onDeleteSubtask(subtask.id)}
            />
          ))}
        </ul>
      )}
      <AddInput placeholder="Add a subtask" onAdd={onAddSubtask} />
    </div>
  );
}

interface SubtaskFieldProps {
  subtask: ListSubtask;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

function SubtaskField({ subtask, onToggle, onRename, onDelete }: SubtaskFieldProps) {
  const title = useDraft(subtask.title, onRename);
  return (
    <li className={subtask.done ? 'sheet-subtask is-done' : 'sheet-subtask'}>
      <button
        className="subtask-tick"
        type="button"
        role="checkbox"
        aria-checked={subtask.done}
        aria-label={subtask.title}
        onClick={onToggle}
      >
        <span className="subtask-box">{subtask.done && <CheckIcon />}</span>
      </button>
      <input
        value={title.text}
        onChange={(event) => title.setText(event.target.value)}
        onBlur={title.commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        aria-label={`Rename ${subtask.title}`}
        enterKeyHint="done"
        autoComplete="off"
      />
      <button className="sheet-subtask-remove" type="button" aria-label={`Remove ${subtask.title}`} onClick={onDelete}>
        <CloseIcon />
      </button>
    </li>
  );
}

/**
 * Up to five stars for how hard an item is to start. Tapping a star sets that many, and tapping
 * the last lit star again clears them all.
 */
function FrictionPicker({ stars, onChange }: { stars: number; onChange: (stars: number) => void }) {
  return (
    <div className="friction" role="group" aria-label="Friction">
      <span className="friction-name" aria-hidden="true">
        Friction
      </span>
      {Array.from({ length: FRICTION_STARS }, (_, index) => {
        const value = index + 1;
        return (
          <button
            key={value}
            className="friction-star"
            type="button"
            aria-pressed={value <= stars}
            aria-label={value === 1 ? '1 star' : `${value} stars`}
            onClick={() => onChange(value === stars ? 0 : value)}
          >
            <StarIcon />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A task's planned day and a time on it, or a routine's time. A planned day is not a deadline:
 * once it passes, the task waits on Today. A task's time only shows once it has a day.
 */
function When({ item, today, onUpdate }: Pick<Props, 'item' | 'today' | 'onUpdate'>) {
  const tomorrow = addDays(today, 1);
  const picked = item.date !== null && item.date !== today && item.date !== tomorrow ? item.date : null;

  return (
    <>
      {item.kind === 'task' && (
        <div>
          <div className="editor-label">When</div>
          <div className="chips" role="group" aria-label="When">
            <Chip pressed={item.date === today} onClick={() => onUpdate({ date: today })}>
              Today
            </Chip>
            <Chip pressed={item.date === tomorrow} onClick={() => onUpdate({ date: tomorrow })}>
              Tomorrow
            </Chip>
            {/* The device's own date picker, laid over the chip so a tap on the chip opens it. */}
            <label className={picked ? 'chip chip-pick is-on' : 'chip chip-pick'}>
              {picked ? dayName(picked, today) : 'Pick'}
              <input
                type="date"
                aria-label="Pick a day"
                value={item.date ?? ''}
                min={today}
                onClick={(event) => openPicker(event.currentTarget)}
                onChange={(event) => {
                  const { value } = event.target;
                  if (value === '') onUpdate({ date: null });
                  else if (isDayKey(value)) onUpdate({ date: value });
                }}
              />
            </label>
            <Chip pressed={item.date === null} onClick={() => onUpdate({ date: null })}>
              None
            </Chip>
          </div>
        </div>
      )}

      {(item.kind === 'routine' || item.date !== null) && (
        <div>
          <div className="editor-label">Time</div>
          <div className="time-row">
            <input
              type="time"
              aria-label="Time"
              value={item.time ?? ''}
              onChange={(event) => onUpdate({ time: event.target.value === '' ? null : event.target.value })}
            />
            {item.time !== null && (
              <button className="text-button" type="button" onClick={() => onUpdate({ time: null })}>
                No time
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Opens a date field's picker. A phone opens it on a tap anyway; a desktop browser only does
 * from its small calendar button, so a click anywhere on the chip asks for it.
 */
function openPicker(input: HTMLInputElement): void {
  try {
    input.showPicker();
  } catch {
    // Already open, or not allowed here: the field still works by hand.
  }
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
