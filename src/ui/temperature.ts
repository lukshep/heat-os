import { FRICTION_STARS, type HeatConfig } from '../heat/config';
import { pointsFor, type DayPosition, type Scorable } from '../heat/engine';

interface Stop {
  at: number;
  lightness: number;
  chroma: number;
  hue: number;
}

/** The temperature of a full gauge. Anything above it is Surge. */
const FULL = 1;
/** The temperature at the very top of Surge. */
export const SURGE_PEAK = 1.2;

/**
 * The temperature gradient, in OKLCH so the steps look even. It follows steel as it is heated:
 * cold blue-grey, a dull red glow, cherry, orange and lemon, to a bright yellow at a full gauge.
 * Beyond full it pales towards white-hot, which only the edge meter in Surge and the hottest
 * rings ever show.
 *
 * Blue-grey cannot turn red without passing through violet, so the cold end fades to plain grey
 * first, where hue cannot be seen, and the red grows out of the grey. Every colour stays inside
 * the sRGB gamut, so no screen clips it.
 */
const STOPS: readonly Stop[] = [
  { at: 0, lightness: 0.52, chroma: 0.022, hue: 250 },
  // Plain grey: no chroma, so its hue is never used.
  { at: 0.16, lightness: 0.47, chroma: 0, hue: 0 },
  { at: 0.34, lightness: 0.47, chroma: 0.12, hue: 25 },
  { at: 0.55, lightness: 0.57, chroma: 0.19, hue: 29 },
  { at: 0.72, lightness: 0.67, chroma: 0.185, hue: 44 },
  { at: 0.86, lightness: 0.78, chroma: 0.165, hue: 66 },
  { at: FULL, lightness: 0.89, chroma: 0.15, hue: 92 },
  { at: SURGE_PEAK, lightness: 0.975, chroma: 0.055, hue: 100 },
];

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function mix(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/** A grey stop has no hue, so the stretch either side of it keeps the hue of its other end. */
function hueBetween(from: Stop, to: Stop, share: number): number {
  if (from.chroma === 0) return to.hue;
  if (to.chroma === 0) return from.hue;
  return mix(from.hue, to.hue, share);
}

/** The colour for a temperature from 0 (cold) through 1 (a full gauge) to the peak of Surge. */
export function heatColor(temperature: number): string {
  const t = clamp(temperature, SURGE_PEAK);
  for (let index = 1; index < STOPS.length; index++) {
    const from = STOPS[index - 1];
    const to = STOPS[index];
    if (!from || !to || t > to.at) continue;
    const share = (t - from.at) / (to.at - from.at);
    const lightness = mix(from.lightness, to.lightness, share).toFixed(3);
    const chroma = mix(from.chroma, to.chroma, share).toFixed(3);
    const hue = hueBetween(from, to, share).toFixed(1);
    return `oklch(${lightness} ${chroma} ${hue})`;
  }
  return 'oklch(0.975 0.055 100)';
}

/** The most any item can earn: a fully warm routine with every star of Friction, the first thing done in its area. */
const HOTTEST_ITEM: Scorable = { areaId: 'hottest', friction: FRICTION_STARS, warmth: 1 };
const START_OF_DAY: DayPosition = { inArea: 0 };

/** Below 1 this lifts small rewards, so everyday items sit in the warm middle, not the cold end. */
const CURVE = 0.45;

/**
 * Turns the points an item would earn right now into a temperature from 0 to SURGE_PEAK, where
 * the peak is the most any item can earn. HEAT plays no part, so a ring shows what the item is
 * worth at any level of the gauge, and Friction or a routine's warmth always shows. The scale is
 * anchored to the engine, so retuning the numbers does not shift every colour. Rings use the
 * whole gradient: only the hottest items reach its pale end, which the edge line also shows in
 * Surge.
 */
export function temperatureOf(points: number, config: HeatConfig): number {
  const hottest = pointsFor(HOTTEST_ITEM, START_OF_DAY, config);
  return hottest > 0 ? SURGE_PEAK * Math.pow(clamp(points / hottest, FULL), CURVE) : 0;
}
