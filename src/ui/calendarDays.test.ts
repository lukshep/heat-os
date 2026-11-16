import { describe, expect, it } from 'vitest';
import { addMonths, monthCells, monthOf, stripDays } from './calendarDays';

// Sunday 15 November 2026.
const TODAY = '2026-11-15';

describe('stripDays', () => {
  it('shows a week from today', () => {
    expect(stripDays(TODAY, TODAY)).toEqual([
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
    ]);
    expect(stripDays(TODAY, '2026-11-21')[0]).toBe(TODAY);
  });

  it('moves on in whole weeks to hold the picked day', () => {
    expect(stripDays(TODAY, '2026-11-22')[0]).toBe('2026-11-22');
    expect(stripDays(TODAY, '2026-12-20')).toContain('2026-12-20');
    expect(stripDays(TODAY, '2026-12-20')[0]).toBe('2026-12-20');
    expect(stripDays(TODAY, '2026-12-25')[0]).toBe('2026-12-20');
  });

  it('never starts before today', () => {
    expect(stripDays(TODAY, '2026-11-01')[0]).toBe(TODAY);
  });
});

describe('months', () => {
  it('are named by their first day', () => {
    expect(monthOf('2026-11-15')).toBe('2026-11-01');
  });

  it('step across the turn of the year', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2027-01-31', -1)).toBe('2026-12-01');
    expect(addMonths('2026-11-01', 14)).toBe('2028-01-01');
  });
});

describe('monthCells', () => {
  it('leaves blanks before the 1st, from the first weekday of the locale', () => {
    // 1 November 2026 is a Sunday.
    expect(monthCells('2026-11-01', 0).slice(0, 2)).toEqual(['2026-11-01', '2026-11-02']);
    const mondayFirst = monthCells('2026-11-01', 1);
    expect(mondayFirst.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
  });

  it('holds every day of the month', () => {
    const february = monthCells('2028-02-01', 1).filter((cell) => cell !== null);
    expect(february).toHaveLength(29);
    expect(february.at(-1)).toBe('2028-02-29');
  });
});
