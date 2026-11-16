import { describe, expect, it } from 'vitest';
import { MONTHLY_EARLY_DAYS } from './config';
import { addDays, type DayKey } from './day';
import { LAST_DAY, lastOccurrence, nextOccurrence, occurrenceNow, occursOn, type Schedule } from './schedule';

// 4 January 2026 is a Sunday.
const MON_THU: Schedule = { every: 'week', days: [1, 4] };
const MID_MONTH: Schedule = { every: 'month', days: [15] };
const MONTH_END: Schedule = { every: 'month', days: [LAST_DAY] };

/** Every date of a schedule in a span of days, both ends included. */
function datesIn(schedule: Schedule, from: DayKey, to: DayKey): DayKey[] {
  const dates: DayKey[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (occursOn(schedule, day)) dates.push(day);
  return dates;
}

describe('occursOn', () => {
  it('matches weekdays', () => {
    expect(occursOn(MON_THU, '2026-01-05')).toBe(true);
    expect(occursOn(MON_THU, '2026-01-06')).toBe(false);
    expect(occursOn(MON_THU, '2026-01-08')).toBe(true);
  });

  it('matches a day of the month', () => {
    expect(datesIn(MID_MONTH, '2026-01-01', '2026-03-31')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('puts the last day on the last day of every month, leap years included', () => {
    expect(datesIn(MONTH_END, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occursOn(MONTH_END, '2028-02-29')).toBe(true);
    expect(occursOn(MONTH_END, '2028-02-28')).toBe(false);
  });

  it('moves a day a month does not have to its last day, never skipping the month', () => {
    const thirtieth: Schedule = { every: 'month', days: [30] };
    expect(datesIn(thirtieth, '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-30']);
  });

  it('counts two days that land on the same date once', () => {
    const both: Schedule = { every: 'month', days: [30, LAST_DAY] };
    expect(datesIn(both, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
    expect(datesIn(both, '2026-03-01', '2026-03-31')).toEqual(['2026-03-30', '2026-03-31']);
  });
});

describe('nextOccurrence and lastOccurrence', () => {
  it('find the dates either side of a day', () => {
    expect(nextOccurrence(MON_THU, '2026-01-05')).toBe('2026-01-08');
    expect(nextOccurrence(MON_THU, '2026-01-08')).toBe('2026-01-12');
    expect(nextOccurrence(MONTH_END, '2026-01-31')).toBe('2026-02-28');
    expect(lastOccurrence(MON_THU, '2026-01-04', '2026-01-07')).toBe('2026-01-05');
    expect(lastOccurrence(MON_THU, '2026-01-04', '2026-01-05')).toBe('2026-01-05');
  });

  it('look only after the day given', () => {
    expect(lastOccurrence(MON_THU, '2026-01-05', '2026-01-07')).toBeNull();
  });

  it('find nothing for a schedule with no days', () => {
    expect(nextOccurrence({ every: 'week', days: [] }, '2026-01-05')).toBeNull();
    expect(lastOccurrence({ every: 'month', days: [] }, '2025-01-01', '2026-01-05')).toBeNull();
  });
});

describe('occurrenceNow, weekly', () => {
  const since = '2026-01-04';
  const none = new Set<DayKey>();

  it('is open and due on its date', () => {
    expect(occurrenceNow(MON_THU, since, none, '2026-01-05')).toEqual({
      kind: 'open',
      occurrence: '2026-01-05',
      due: true,
    });
  });

  it('stays open until the next date comes, so it can be done late', () => {
    expect(occurrenceNow(MON_THU, since, none, '2026-01-07')).toEqual({
      kind: 'open',
      occurrence: '2026-01-05',
      due: true,
    });
    expect(occurrenceNow(MON_THU, since, none, '2026-01-08')).toEqual({
      kind: 'open',
      occurrence: '2026-01-08',
      due: true,
    });
  });

  it('is done until the next date once done, and never opens early', () => {
    const kept = new Set(['2026-01-05']);
    expect(occurrenceNow(MON_THU, since, kept, '2026-01-07')).toEqual({ kind: 'done', occurrence: '2026-01-05' });
  });

  it('waits when no date has come since it was made', () => {
    expect(occurrenceNow(MON_THU, '2026-01-05', none, '2026-01-07')).toEqual({ kind: 'waiting' });
  });
});

describe('occurrenceNow, monthly', () => {
  const since = '2026-01-01';
  const none = new Set<DayKey>();
  const january = new Set(['2026-01-31']);

  it(`opens ${MONTHLY_EARLY_DAYS} days early, and is due from its date`, () => {
    expect(occurrenceNow(MONTH_END, since, none, '2026-01-23')).toEqual({ kind: 'waiting' });
    expect(occurrenceNow(MONTH_END, since, none, '2026-01-24')).toEqual({
      kind: 'open',
      occurrence: '2026-01-31',
      due: false,
    });
    expect(occurrenceNow(MONTH_END, since, none, '2026-01-31')).toEqual({
      kind: 'open',
      occurrence: '2026-01-31',
      due: true,
    });
  });

  it('stays open all month when it is not done', () => {
    expect(occurrenceNow(MONTH_END, since, none, '2026-02-27')).toEqual({
      kind: 'open',
      occurrence: '2026-01-31',
      due: true,
    });
  });

  it('opens the next date early only once the one before it is done', () => {
    expect(occurrenceNow(MONTH_END, since, january, '2026-02-20')).toEqual({ kind: 'done', occurrence: '2026-01-31' });
    expect(occurrenceNow(MONTH_END, since, january, '2026-02-21')).toEqual({
      kind: 'open',
      occurrence: '2026-02-28',
      due: false,
    });
  });

  it('is done once a date has been done early', () => {
    const both = new Set(['2026-01-31', '2026-02-28']);
    expect(occurrenceNow(MONTH_END, since, both, '2026-02-23')).toEqual({ kind: 'done', occurrence: '2026-02-28' });
  });

  it('never opens before the day after the date before it', () => {
    const twice: Schedule = { every: 'month', days: [1, 5] };
    const kept = new Set(['2026-01-01']);
    expect(occurrenceNow(twice, '2025-12-31', kept, '2026-01-01')).toEqual({ kind: 'done', occurrence: '2026-01-01' });
    expect(occurrenceNow(twice, '2025-12-31', kept, '2026-01-02')).toEqual({
      kind: 'open',
      occurrence: '2026-01-05',
      due: false,
    });
  });

  it('can be done at once when it is made within a week of its date', () => {
    expect(occurrenceNow(MONTH_END, '2026-01-25', none, '2026-01-26')).toEqual({
      kind: 'open',
      occurrence: '2026-01-31',
      due: false,
    });
  });
});
