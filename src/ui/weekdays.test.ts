import { describe, expect, it } from 'vitest';
import { describeDays, weekdayName, weekdayOrder } from './weekdays';

describe('weekdayOrder', () => {
  it('starts the week where the locale does', () => {
    expect(weekdayOrder('en-GB')).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder('en-US')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('falls back to Monday for a locale it cannot read', () => {
    expect(weekdayOrder('not a locale')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('weekdayName', () => {
  it('names each weekday number', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((day) => weekdayName(day, 'en-GB'))).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });
});

describe('describeDays', () => {
  it('uses a plain phrase for the common schedules', () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeDays([6, 0])).toBe('Weekends');
  });

  it('lists other schedules in the order of the locale week', () => {
    expect(describeDays([5, 1, 3], 'en-GB')).toBe('Mon, Wed, Fri');
    expect(describeDays([0, 3], 'en-GB')).toBe('Wed, Sun');
    expect(describeDays([0, 3], 'en-US')).toBe('Sun, Wed');
    expect(describeDays([2], 'en-GB')).toBe('Tue');
  });
});
