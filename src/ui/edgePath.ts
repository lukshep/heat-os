import { FULL_HEAT } from '../heat/config';
import { heatColor } from './temperature';

/**
 * The path the edge meter runs along: a rounded rectangle just inside the screen, starting
 * at the top centre and going anticlockwise, down the left side first. Halfway round is the
 * bottom centre.
 */
export interface EdgeShape {
  width: number;
  height: number;
  /** How far inside the edge the line's centre sits. */
  inset: number;
  /** Corner radius of the line. Reduced if the shape is too small for it. */
  radius: number;
}

/** The SVG path, drawn in the direction HEAT fills. */
export function edgePath(shape: EdgeShape): string {
  const innerWidth = Math.max(0, shape.width - 2 * shape.inset);
  const innerHeight = Math.max(0, shape.height - 2 * shape.inset);
  const r = Math.max(0, Math.min(shape.radius, innerWidth / 2, innerHeight / 2));
  const left = shape.inset;
  const top = shape.inset;
  const right = shape.width - shape.inset;
  const bottom = shape.height - shape.inset;
  const centre = shape.width / 2;
  // Sweep flag 0: each corner turns anticlockwise on screen.
  return [
    `M${centre},${top}`,
    `H${left + r}`,
    `A${r},${r} 0 0 0 ${left},${top + r}`,
    `V${bottom - r}`,
    `A${r},${r} 0 0 0 ${left + r},${bottom}`,
    `H${right - r}`,
    `A${r},${r} 0 0 0 ${right},${bottom - r}`,
    `V${top + r}`,
    `A${r},${r} 0 0 0 ${right - r},${top}`,
    `H${centre}`,
  ].join(' ');
}

/** One stretch of the line's gradient: where it starts and how long it is, in HEAT, and its colour. */
export interface GradientPiece {
  start: number;
  length: number;
  color: string;
}

/** How far each piece runs on under the next, in HEAT, so no hairline seam shows between them. */
const SEAM_OVERLAP = 0.05;

/**
 * The gradient laid along the line as `count` pieces end to end, from the top centre to a full
 * gauge. An SVG stroke cannot change colour along a path, so the line is drawn in pieces, each
 * the colour of the temperature at its middle. The last ends exactly at a full gauge.
 */
export function gradientPieces(count: number): GradientPiece[] {
  const step = FULL_HEAT / count;
  return Array.from({ length: count }, (_, index) => ({
    start: index * step,
    length: index === count - 1 ? step : step + SEAM_OVERLAP,
    color: heatColor((index + 0.5) / count),
  }));
}
