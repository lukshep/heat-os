/**
 * The path the edge meter runs along: a rounded rectangle just inside the screen, starting
 * at the top centre and going clockwise. Halfway round is the bottom centre.
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
  return [
    `M${centre},${top}`,
    `H${right - r}`,
    `A${r},${r} 0 0 1 ${right},${top + r}`,
    `V${bottom - r}`,
    `A${r},${r} 0 0 1 ${right - r},${bottom}`,
    `H${left + r}`,
    `A${r},${r} 0 0 1 ${left},${bottom - r}`,
    `V${top + r}`,
    `A${r},${r} 0 0 1 ${left + r},${top}`,
    `H${centre}`,
  ].join(' ');
}
