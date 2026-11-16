import { useState, type ReactNode } from 'react';
import { dayOfMonth, weekdayOf, type DayKey } from '../heat/day';
import { addMonths, monthCells, monthOf, stripDays } from './calendarDays';
import { fullDayName, monthName } from './dates';
import { ChevronIcon } from './icons';
import { weekdayName, weekdayOrder } from './weekdays';

interface Days {
  today: DayKey;
  /** The day Today is showing. */
  picked: DayKey;
  /** True for a day with something planned on it, which earns a quiet dot. Never a count. */
  hasPlans: (day: DayKey) => boolean;
  onPick: (day: DayKey) => void;
}

/**
 * The calendar at the top of Today: a strip of seven days, and a month grid that opens from
 * the month's name. It looks forward only. A past day is dimmed and cannot be picked, since
 * nothing is kept of what was or was not done on it.
 */
export function Calendar(props: Days) {
  const { today, picked, onPick } = props;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(picked));
  const firstMonth = monthOf(today);

  function toggle() {
    if (!open) setMonth(monthOf(picked));
    setOpen(!open);
  }

  // Picking a day in the grid closes it, so the strip shows the day picked.
  const days: Days = {
    ...props,
    onPick(day) {
      onPick(day);
      setOpen(false);
    },
  };

  return (
    <section className="calendar" aria-label="Calendar">
      <div className="calendar-head">
        <button className="calendar-month" type="button" aria-expanded={open} onClick={toggle}>
          {monthName(open ? month : monthOf(picked), today)}
          <ChevronIcon />
        </button>
        {open ? (
          <>
            <button
              className="calendar-step is-back"
              type="button"
              aria-label="Previous month"
              disabled={month <= firstMonth}
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronIcon />
            </button>
            <button
              className="calendar-step"
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronIcon />
            </button>
          </>
        ) : (
          picked !== today && (
            <button className="text-button" type="button" onClick={() => onPick(today)}>
              Back to today
            </button>
          )
        )}
      </div>

      {open ? (
        <MonthGrid month={month} {...days} />
      ) : (
        <div className="calendar-strip">
          {stripDays(today, picked).map((day) => (
            <DayButton key={day} day={day} {...days}>
              <span className="calendar-weekday">{weekdayName(weekdayOf(day))}</span>
            </DayButton>
          ))}
        </div>
      )}
    </section>
  );
}

/** A month, a row per week from the locale's first weekday. */
function MonthGrid({ month, ...days }: Days & { month: DayKey }) {
  const order = weekdayOrder();
  return (
    <div className="calendar-grid">
      {order.map((weekday) => (
        <span key={weekday} className="calendar-weekday" aria-hidden="true">
          {weekdayName(weekday)}
        </span>
      ))}
      {monthCells(month, order[0] ?? 1).map((day, index) =>
        day === null ? <span key={`blank-${index}`} /> : <DayButton key={day} day={day} {...days} />,
      )}
    </div>
  );
}

function DayButton({ day, today, picked, hasPlans, onPick, children }: Days & { day: DayKey; children?: ReactNode }) {
  const past = day < today;
  const marked = !past && hasPlans(day);
  const className = ['calendar-day', day === today && 'is-today', marked && 'has-plans'].filter(Boolean).join(' ');
  return (
    <button
      className={className}
      type="button"
      aria-pressed={day === picked}
      aria-label={marked ? `${fullDayName(day, today)}, something planned` : fullDayName(day, today)}
      disabled={past}
      onClick={() => onPick(day)}
    >
      {children}
      <span className="calendar-date">{dayOfMonth(day)}</span>
    </button>
  );
}
