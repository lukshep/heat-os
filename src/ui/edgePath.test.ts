import { describe, expect, it } from 'vitest';
import { FULL_HEAT } from '../heat/config';
import { edgePath, gradientPieces } from './edgePath';
import { heatColor } from './temperature';

describe('edgePath', () => {
  it('draws from the top centre, anticlockwise down the left side, back to the top centre', () => {
    expect(edgePath({ width: 390, height: 844, inset: 4, radius: 50 })).toBe(
      'M195,4 H54 A50,50 0 0 0 4,54 V790 A50,50 0 0 0 54,840 H336 A50,50 0 0 0 386,790 V54 A50,50 0 0 0 336,4 H195',
    );
  });

  it('shrinks the corners rather than break when the shape is small', () => {
    expect(edgePath({ width: 40, height: 100, inset: 4, radius: 50 })).toBe(
      'M20,4 H20 A16,16 0 0 0 4,20 V80 A16,16 0 0 0 20,96 H20 A16,16 0 0 0 36,80 V20 A16,16 0 0 0 20,4 H20',
    );
  });

  it('collapses to a point before the screen has been measured', () => {
    expect(edgePath({ width: 0, height: 0, inset: 4, radius: 50 })).toBe(
      'M0,4 H4 A0,0 0 0 0 4,4 V-4 A0,0 0 0 0 4,-4 H-4 A0,0 0 0 0 -4,-4 V4 A0,0 0 0 0 -4,4 H0',
    );
  });
});

describe('gradientPieces', () => {
  const pieces = gradientPieces(100);

  it('runs the gradient from cold at the top centre to a full gauge', () => {
    expect(pieces).toHaveLength(100);
    expect(pieces[0]?.color).toBe(heatColor(0.005));
    expect(pieces[99]?.color).toBe(heatColor(0.995));
  });

  it('lays the pieces end to end, each running a little under the next', () => {
    pieces.forEach((piece, index) => {
      expect(piece.start).toBeCloseTo(index, 10);
      const next = pieces[index + 1];
      if (next) expect(piece.start + piece.length).toBeGreaterThan(next.start);
    });
  });

  it('ends exactly at a full gauge', () => {
    const last = pieces[pieces.length - 1];
    expect((last?.start ?? 0) + (last?.length ?? 0)).toBeCloseTo(FULL_HEAT, 10);
  });
});
