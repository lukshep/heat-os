import { describe, expect, it } from 'vitest';
import { edgeLength, edgePath, edgePoint, type EdgeShape } from './edgePath';

/** A phone-sized screen with the line 4 points in and generous corners. */
const phone: EdgeShape = { width: 390, height: 844, inset: 4, radius: 50 };

function near(point: { x: number; y: number }, x: number, y: number) {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
}

describe('edgePoint', () => {
  it('starts and ends at the top centre', () => {
    near(edgePoint(phone, 0), 195, 4);
    near(edgePoint(phone, 1), 195, 4);
  });

  it('is at the bottom centre halfway round', () => {
    near(edgePoint(phone, 0.5), 195, 840);
  });

  it('goes clockwise: right side at a quarter, left side at three quarters', () => {
    near(edgePoint(phone, 0.25), 386, 422);
    near(edgePoint(phone, 0.75), 4, 422);
  });

  it('puts the usual line, 60, just past the bottom-left corner', () => {
    const mark = edgePoint(phone, 0.6);
    expect(mark.x).toBeLessThan(54);
    expect(mark.y).toBeGreaterThan(700);
    expect(mark.y).toBeLessThan(840);
  });

  it('follows the curve of a corner', () => {
    // Halfway through the top-right corner sits on its 45 degree diagonal.
    const straight = (390 - 8 - 100) / 2;
    const fraction = (straight + (Math.PI * 50) / 4) / edgeLength(phone);
    const centreX = 386 - 50;
    const centreY = 4 + 50;
    near(edgePoint(phone, fraction), centreX + 50 * Math.SQRT1_2, centreY - 50 * Math.SQRT1_2);
  });

  it('clamps anything outside 0 to 1', () => {
    near(edgePoint(phone, -3), 195, 4);
    near(edgePoint(phone, 7), 195, 4);
  });
});

describe('edgeLength', () => {
  it('is the straight edges plus one full circle of corner', () => {
    expect(edgeLength(phone)).toBeCloseTo(2 * 282 + 2 * 736 + 2 * Math.PI * 50, 6);
  });

  it('shrinks the corners rather than break when the shape is small', () => {
    const tiny: EdgeShape = { width: 40, height: 100, inset: 4, radius: 50 };
    expect(edgeLength(tiny)).toBeCloseTo(2 * 60 + 2 * Math.PI * 16, 6);
    near(edgePoint(tiny, 0.5), 20, 96);
  });

  it('is zero before the screen has been measured', () => {
    expect(edgeLength({ width: 0, height: 0, inset: 4, radius: 50 })).toBe(0);
  });
});

describe('edgePath', () => {
  it('draws from the top centre, clockwise, back to the top centre', () => {
    expect(edgePath(phone)).toBe(
      'M195,4 H336 A50,50 0 0 1 386,54 V790 A50,50 0 0 1 336,840 H54 A50,50 0 0 1 4,790 V54 A50,50 0 0 1 54,4 H195',
    );
  });
});
