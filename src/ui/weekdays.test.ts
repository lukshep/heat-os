import { describe, expect, it } from 'vitest';
import { LAST_DAY } from '../heat/schedule';
import { describeDays, describeSchedule, monthDayName, ordinal, weekdayName, weekdayOrder } from './weekdays';

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

describe('ordinal', () => {
  it('gives each day of the month its English ending', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '30th',
    ]);
  });
});

describe('monthDayName', () => {
  it('names the last day by what it means, not by a number', () => {
    expect(monthDayName(LAST_DAY)).toBe('Last day');
    expect(monthDayName(15)).toBe('15th');
  });
});

describe('describeSchedule', () => {
  it('calls a schedule on all seven days Daily, as the picker does', () => {
    expect(describeSchedule({ every: 'week', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Daily');
  });

  it('describes a weekly schedule by its days', () => {
    expect(describeSchedule({ every: 'week', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
  });

  it('describes a monthly schedule by its days of the month, in order', () => {
    expect(describeSchedule({ every: 'month', days: [LAST_DAY] })).toBe('Monthly · Last day');
    expect(describeSchedule({ every: 'month', days: [15, 1] })).toBe('Monthly · 1st, 15th');
    expect(describeSchedule({ every: 'month', days: [1, LAST_DAY] })).toBe('Monthly · 1st, Last day');
  });
});
