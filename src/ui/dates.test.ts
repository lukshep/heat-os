import { describe, expect, it } from 'vitest';
import { dayName, describeWhen, fullDayName, monthName, shortDayName, timeName } from './dates';

// Sunday 15 November 2026.
const TODAY = '2026-11-15';

describe('timeName', () => {
  it('writes a time the way the locale does', () => {
    expect(timeName('09:30', 'en-GB')).toBe('9:30');
    expect(timeName('21:05', 'en-GB')).toBe('21:05');
    expect(timeName('09:30', 'en-US')).toMatch(/^9:30\sAM$/u);
  });
});

describe('dayName', () => {
  it('names the days either side of today', () => {
    expect(dayName('2026-11-15', TODAY, 'en-GB')).toBe('Today');
    expect(dayName('2026-11-16', TODAY, 'en-GB')).toBe('Tomorrow');
    expect(dayName('2026-11-14', TODAY, 'en-GB')).toBe('Yesterday');
  });

  it('names the rest of the coming week by its weekday', () => {
    expect(dayName('2026-11-17', TODAY, 'en-GB')).toBe('Tue');
    expect(dayName('2026-11-21', TODAY, 'en-GB')).toBe('Sat');
  });

  it('gives the date for anything further, and the year only when it is not this one', () => {
    expect(dayName('2026-11-22', TODAY, 'en-GB')).toBe('22 Nov');
    expect(dayName('2026-11-09', TODAY, 'en-GB')).toBe('9 Nov');
    expect(dayName('2027-01-04', TODAY, 'en-GB')).toBe('4 Jan 2027');
    expect(dayName('2026-11-22', TODAY, 'en-US')).toBe('Nov 22');
  });
});

describe('describeWhen', () => {
  it('joins the day and the time', () => {
    expect(describeWhen('2026-11-20', '09:30', TODAY, undefined, 'en-GB')).toBe('Fri · 9:30');
    expect(describeWhen('2026-11-20', null, TODAY, undefined, 'en-GB')).toBe('Fri');
    expect(describeWhen(null, '07:00', TODAY, undefined, 'en-GB')).toBe('7:00');
  });

  it("leaves out the day a list is for, keeping the time", () => {
    expect(describeWhen(TODAY, '09:30', TODAY, TODAY, 'en-GB')).toBe('9:30');
    expect(describeWhen(TODAY, null, TODAY, TODAY, 'en-GB')).toBeNull();
    expect(describeWhen('2026-11-14', null, TODAY, TODAY, 'en-GB')).toBe('Yesterday');
  });

  it('says nothing for an undated task with no time', () => {
    expect(describeWhen(null, null, TODAY)).toBeNull();
  });
});

describe('fullDayName, shortDayName and monthName', () => {
  it('write a day in full for a heading, and in short with its date', () => {
    expect(fullDayName('2026-11-20', TODAY, 'en-GB')).toBe('Friday 20 November');
    expect(shortDayName('2026-11-20', TODAY, 'en-GB')).toBe('Fri 20 Nov');
  });

  it('add the year only when it is not this one', () => {
    expect(fullDayName('2027-01-04', TODAY, 'en-GB')).toBe('Monday, 4 January 2027');
    expect(monthName('2026-11-01', TODAY, 'en-GB')).toBe('November');
    expect(monthName('2027-01-01', TODAY, 'en-GB')).toBe('January 2027');
  });
});
