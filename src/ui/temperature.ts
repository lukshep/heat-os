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
 * The temperature gradient, in OKLCH so the steps look even. It follows a thermal camera's
 * palette: deep indigo, through violet, magenta, crimson and orange, to a bright yellow at a
 * full gauge, getting lighter all the way. Beyond full it pales towards white-hot, which only
 * the edge meter in Surge and the hottest rings ever show. Hue keeps climbing past 360 so the
 * path never doubles back through green, and every colour stays inside the sRGB gamut, so no
 * screen clips it.
 */
const STOPS: readonly Stop[] = [
  { at: 0, lightness: 0.42, chroma: 0.14, hue: 282 },
  { at: 0.28, lightness: 0.48, chroma: 0.2, hue: 305 },
  { at: 0.5, lightness: 0.57, chroma: 0.21, hue: 340 },
  { at: 0.68, lightness: 0.64, chroma: 0.2, hue: 382 },
  { at: 0.84, lightness: 0.75, chroma: 0.165, hue: 418 },
  { at: FULL, lightness: 0.89, chroma: 0.155, hue: 455 },
  { at: SURGE_PEAK, lightness: 0.975, chroma: 0.05, hue: 462 },
];

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function mix(from: number, to: number, share: number): number {
  return from + (to - from) * share;
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
    const hue = (mix(from.hue, to.hue, share) % 360).toFixed(1);
    return `oklch(${lightness} ${chroma} ${hue})`;
  }
  return 'oklch(0.975 0.05 102)';
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
