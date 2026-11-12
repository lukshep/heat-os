import { describe, expect, it } from 'vitest';
import { addDays, dayKeyAt, daysBetween, weekdayOf } from './day';

describe('dayKeyAt', () => {
  it('starts a new day at the day-start hour, not at midnight', () => {
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 3, 59), 4, 0)).toBe('2026-01-04');
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 4, 0), 4, 0)).toBe('2026-01-05');
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 23, 59), 4, 0)).toBe('2026-01-05');
  });

  it('uses the local clock given by the UTC offset', () => {
    // UTC-5: 08:59 UTC is 03:59 local, 09:00 UTC is 04:00 local.
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 8, 59), 4, -300)).toBe('2026-01-04');
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 9, 0), 4, -300)).toBe('2026-01-05');
    // UTC+10: 18:00 UTC is 04:00 the next local day.
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 18, 0), 4, 600)).toBe('2026-01-06');
  });

  it('falls back to midnight when the day-start hour is 0', () => {
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 0, 0), 0, 0)).toBe('2026-01-05');
    expect(dayKeyAt(Date.UTC(2026, 0, 5, 0, 0) - 1, 0, 0)).toBe('2026-01-04');
  });
});

describe('day arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-05', 0)).toBe('2026-01-05');
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2026-01-05', '2026-01-12')).toBe(7);
    expect(daysBetween('2026-01-12', '2026-01-05')).toBe(-7);
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
  });

  it('reports the weekday with Sunday as 0', () => {
    expect(weekdayOf('2026-01-04')).toBe(0);
    expect(weekdayOf('2026-01-05')).toBe(1);
    expect(weekdayOf('2026-01-10')).toBe(6);
  });

  it('orders keys correctly as plain strings', () => {
    expect('2026-01-31' < '2026-02-01').toBe(true);
    expect('2026-12-31' < '2027-01-01').toBe(true);
  });
});
