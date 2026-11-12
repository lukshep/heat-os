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

interface Parts {
  radius: number;
  /** Straight length of the top or bottom edge, between its corners. */
  across: number;
  /** Straight length of the left or right edge, between its corners. */
  down: number;
}

function parts(shape: EdgeShape): Parts {
  const innerWidth = Math.max(0, shape.width - 2 * shape.inset);
  const innerHeight = Math.max(0, shape.height - 2 * shape.inset);
  const radius = Math.max(0, Math.min(shape.radius, innerWidth / 2, innerHeight / 2));
  return { radius, across: innerWidth - 2 * radius, down: innerHeight - 2 * radius };
}

export function edgeLength(shape: EdgeShape): number {
  const { radius, across, down } = parts(shape);
  return 2 * across + 2 * down + 2 * Math.PI * radius;
}

/** The SVG path, drawn in the direction HEAT fills. */
export function edgePath(shape: EdgeShape): string {
  const { radius: r } = parts(shape);
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

/** Where a point sits that is `fraction` of the way round, from 0 (top centre) to 1 (back there). */
export function edgePoint(shape: EdgeShape, fraction: number): { x: number; y: number } {
  const { radius: r, across, down } = parts(shape);
  const left = shape.inset;
  const top = shape.inset;
  const right = shape.width - shape.inset;
  const bottom = shape.height - shape.inset;
  const centre = shape.width / 2;
  const arc = (Math.PI * r) / 2;

  let remaining = Math.max(0, Math.min(1, fraction)) * edgeLength(shape);

  /** A point on a corner, `share` of the way through its quarter turn, which starts at `fromDegrees`. */
  const onCorner = (cx: number, cy: number, fromDegrees: number, share: number) => {
    const angle = ((fromDegrees + 90 * share) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  // Each leg: its length, and the point `share` of the way along it.
  const legs: [number, (share: number) => { x: number; y: number }][] = [
    [across / 2, (share) => ({ x: centre + (across / 2) * share, y: top })],
    [arc, (share) => onCorner(right - r, top + r, -90, share)],
    [down, (share) => ({ x: right, y: top + r + down * share })],
    [arc, (share) => onCorner(right - r, bottom - r, 0, share)],
    [across, (share) => ({ x: right - r - across * share, y: bottom })],
    [arc, (share) => onCorner(left + r, bottom - r, 90, share)],
    [down, (share) => ({ x: left, y: bottom - r - down * share })],
    [arc, (share) => onCorner(left + r, top + r, 180, share)],
    [across / 2, (share) => ({ x: left + r + (across / 2) * share, y: top })],
  ];

  for (const [length, at] of legs) {
    if (remaining <= length) return at(length > 0 ? remaining / length : 0);
    remaining -= length;
  }
  return { x: centre, y: top };
}
