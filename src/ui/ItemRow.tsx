import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ID } from '../data/model';
import type { ListItem } from '../data/selectors';
import { FRICTION_STARS } from '../heat/config';
import type { DayKey } from '../heat/day';
import { describeWhen } from './dates';
import { CheckIcon, DetailsIcon } from './icons';
import { heatColor } from './temperature';
import { describeSchedule } from './weekdays';

interface Props {
  item: ListItem;
  /** 0 (cold) to SURGE_PEAK (hottest): how many points completing it would earn right now, whatever HEAT is. */
  temperature: number;
  today: DayKey;
  /** The day the list is for, if it is for one. A row planned for it shows only its time. */
  listDay?: DayKey | undefined;
  /** Its description and subtasks are showing. Only a row that has some can open. */
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
  /** Opens the item's panel. */
  onEdit: () => void;
  onToggleSubtask: (subtaskId: ID) => void;
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
  const hasDetails = item.description !== '' || item.subtasks.length > 0;
  const press = useLongPress(props.onEdit);

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
    hasDetails && (
      <span className="row-has-details" role="img" aria-label="Has details">
        <DetailsIcon />
      </span>
    ),
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
          {/* A tap shows the details, or opens the panel when there are none. A long press always opens it. */}
          <button
            className="row-title"
            type="button"
            aria-expanded={hasDetails ? open : undefined}
            aria-haspopup={hasDetails ? undefined : 'dialog'}
            onClick={hasDetails ? props.onToggle : props.onEdit}
            {...press}
          >
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
        {open && hasDetails && (
          <Details item={item} waiting={waiting} onEdit={props.onEdit} onToggleSubtask={props.onToggleSubtask} />
        )}
      </div>
    </li>
  );
}

/**
 * What opens under a row: its description, its subtasks to tick, and the way into its panel.
 * Subtasks are grey and earn nothing; a routine's are ticked for the date it is on.
 */
function Details({
  item,
  waiting,
  onEdit,
  onToggleSubtask,
}: Pick<Props, 'item' | 'onEdit' | 'onToggleSubtask'> & { waiting: boolean }) {
  return (
    <div className="details">
      {item.description !== '' && <p className="details-text">{item.description}</p>}
      {item.subtasks.length > 0 && (
        <ul className="details-subtasks">
          {item.subtasks.map((subtask) => (
            <li key={subtask.id}>
              <button
                className="details-subtask"
                type="button"
                role="checkbox"
                aria-checked={subtask.done}
                // A routine whose date has not opened cannot be done yet, and neither can its steps.
                disabled={waiting}
                onClick={() => onToggleSubtask(subtask.id)}
              >
                <span className="subtask-box">{subtask.done && <CheckIcon />}</span>
                <span className="details-subtask-title">{subtask.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="text-button details-edit" type="button" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

/** How long a press on a row has to last to open its panel. */
const LONG_PRESS_MS = 500;
/** How far a press can drift, in CSS pixels, before it counts as the start of a scroll. */
const PRESS_SLOP = 10;
/** How soon after a long press ends a click is taken as its own, and ignored. */
const CLICK_AFTER_PRESS_MS = 600;

/**
 * Opens the panel on a long press, or on a right click with a mouse. Moving the finger, or the
 * list starting to scroll, cancels the press, so scrolling and swiping between areas are left
 * alone. The click that ends a long press does nothing more.
 */
function useLongPress(onLongPress: () => void) {
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const pending = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const ignoreClicksUntil = useRef(0);

  function cancel() {
    if (pending.current === null) return;
    window.clearTimeout(pending.current.timer);
    pending.current = null;
  }

  function fire() {
    cancel();
    fired.current = true;
    latest.current();
  }

  useEffect(() => cancel, []);

  return {
    onPointerDown(event: PointerEvent) {
      cancel();
      fired.current = false;
      if (event.button !== 0) return;
      pending.current = { timer: window.setTimeout(fire, LONG_PRESS_MS), x: event.clientX, y: event.clientY };
    },
    onPointerMove(event: PointerEvent) {
      const start = pending.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > PRESS_SLOP) cancel();
    },
    onPointerUp() {
      cancel();
      if (fired.current) ignoreClicksUntil.current = performance.now() + CLICK_AFTER_PRESS_MS;
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture(event: MouseEvent) {
      if (performance.now() >= ignoreClicksUntil.current) return;
      ignoreClicksUntil.current = 0;
      event.preventDefault();
      event.stopPropagation();
    },
    // A phone's own long-press menu, or a right click: the panel instead.
    onContextMenu(event: MouseEvent) {
      event.preventDefault();
      if (!fired.current) fire();
    },
  };
}

/** A row's stars of Friction, filled ones only. A screen reader hears how many of how many. */
function Stars({ stars }: { stars: number }) {
  return (
    <span className="row-stars" role="img" aria-label={`Friction, ${stars} of ${FRICTION_STARS} stars`}>
      {'★'.repeat(stars)}
    </span>
  );
}

/** What the ring does, said for a screen reader. */
function checkLabel(title: string, done: boolean, undoable: boolean, waiting: boolean): string {
  if (done) return undoable ? `Undo: ${title}` : `Done: ${title}`;
  return waiting ? `Not open yet: ${title}` : `Complete: ${title}`;
}
