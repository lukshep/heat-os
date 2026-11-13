import { describe, expect, it } from 'vitest';
import { edgePath } from './edgePath';

describe('edgePath', () => {
  it('draws from the top centre, clockwise, back to the top centre', () => {
    expect(edgePath({ width: 390, height: 844, inset: 4, radius: 50 })).toBe(
      'M195,4 H336 A50,50 0 0 1 386,54 V790 A50,50 0 0 1 336,840 H54 A50,50 0 0 1 4,790 V54 A50,50 0 0 1 54,4 H195',
    );
  });

  it('shrinks the corners rather than break when the shape is small', () => {
    expect(edgePath({ width: 40, height: 100, inset: 4, radius: 50 })).toBe(
      'M20,4 H20 A16,16 0 0 1 36,20 V80 A16,16 0 0 1 20,96 H20 A16,16 0 0 1 4,80 V20 A16,16 0 0 1 20,4 H20',
    );
  });

  it('collapses to a point before the screen has been measured', () => {
    expect(edgePath({ width: 0, height: 0, inset: 4, radius: 50 })).toBe(
      'M0,4 H-4 A0,0 0 0 1 -4,4 V-4 A0,0 0 0 1 -4,-4 H4 A0,0 0 0 1 4,-4 V4 A0,0 0 0 1 4,4 H0',
    );
  });
});
