import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import type { ItemPatch } from '../data/reducer';
import type { ListItem, Place } from '../data/selectors';
import { FRICTION_STARS } from '../heat/config';
import { addDays, isDayKey, type DayKey } from '../heat/day';
import { DAILY, isDaily, LAST_DAY, type Schedule } from '../heat/schedule';
import { dayName, describeWhen } from './dates';
import { CheckIcon, StarIcon } from './icons';
import { heatColor } from './temperature';
import { describeSchedule, monthDayName, weekdayName, weekdayOrder } from './weekdays';

interface Props {
  item: ListItem;
  /** 0 (cold) to SURGE_PEAK (hottest): how many points completing it would earn right now, whatever HEAT is. */
  temperature: number;
  /** Every area and project, for choosing where the item lives. */
  places: readonly Place[];
  today: DayKey;
  /** The day the list is for, if it is for one. A row planned for it shows only its time. */
  listDay?: DayKey | undefined;
  open: boolean;
  /** The row stays in its list once completed, so it must not fold away. True for a routine outside Today. */
  stays: boolean;
  /** The row joined a list that was already on screen, so it should ease in. Read once, when it appears. */
  arrives: boolean;
  /** A routine shown on a later day whose date has not opened: it can be opened and edited, not done. */
  waiting?: boolean;
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

  // Priority shows as a bold title, so only a screen reader needs the word.
  const meta: ReactNode[] = [
    context,
    item.repeat && describeSchedule(item.repeat),
    describeWhen(item.date, item.time, props.today, props.listDay),
    item.friction > 0 && <Stars stars={item.friction} />,
  ].filter(Boolean);

  const waiting = !done && props.waiting === true;
  const className = [
    'row',
    arrived && 'is-entering',
    leaving && 'is-leaving',
    done && 'is-done',
    waiting && 'is-waiting',
    item.priority && 'is-priority',
  ]
    .filter(Boolean)
    .join(' ');
  // The glow stops growing at a full gauge's temperature, so the hottest rings are paler, not bigger.
  const glow = Math.min(1, temperature);
  const style = { '--temp': heatColor(temperature), '--glow': glow.toFixed(3) } as CSSProperties;

  return (
    <li className={className} style={style}>
      <div className="row-inner">
        <div className="row-main">
          <button
            className="row-check"
            type="button"
            aria-label={checkLabel(item.title, done, undoable, waiting)}
            disabled={(done && !undoable) || waiting}
            onClick={done ? props.onUndo : complete}
          >
            <span className="row-check-ring">{done && <CheckIcon />}</span>
          </button>
          <button className="row-title" type="button" aria-expanded={open} onClick={props.onToggle}>
            <span className="row-title-text">
              {item.priority && <span className="visually-hidden">Priority: </span>}
              {item.title}
            </span>
            {meta.length > 0 && (
              <span className="row-meta">
                {meta.map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 && ' · '}
                    {part}
                  </Fragment>
                ))}
              </span>
            )}
          </button>
          {props.trailing}
        </div>
        {open && <Editor {...props} />}
      </div>
    </li>
  );
}

/** A row's stars of Friction, filled ones only. A screen reader hears how many of how many. */
function Stars({ stars }: { stars: number }) {
  return (
    <span className="row-stars" role="img" aria-label={`Friction, ${stars} of ${FRICTION_STARS} stars`}>
      {'\u2605'.repeat(stars)}
    </span>
  );
}

/** What the ring does, said for a screen reader. */
function checkLabel(title: string, done: boolean, undoable: boolean, waiting: boolean): string {
  if (done) return undoable ? `Undo: ${title}` : `Done: ${title}`;
  return waiting ? `Not open yet: ${title}` : `Complete: ${title}`;
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

function Editor({ item, places, today, onUpdate, onSetSchedule, onDelete }: Props) {
  const [title, setTitle] = useState(item.title);
  // Which picker is showing. Daily applies at once; Weekly and Monthly change nothing until a day is chosen.
  const [every, setEvery] = useState<Repeat>(() => repeatOf(item.repeat));
  const chosen = item.repeat?.every === every ? item.repeat.days : [];

  function commitTitle() {
    const next = title.trim();
    if (next && next !== item.title) onUpdate({ title: next });
    else setTitle(item.title);
  }

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
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          aria-label="Title"
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>

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
