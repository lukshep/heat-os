import type { HeatConfig } from '../heat/config';
import { applyGain, pointsFor, type DayPosition, type Scorable } from '../heat/engine';

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
 * The temperature gradient, in OKLCH so the steps look even. It runs from a muted slate
 * through violet and red to a bright yellow at a full gauge, and gets more vivid as it gets
 * hotter. Beyond full it pales towards white-hot, which only the edge meter in Surge ever
 * shows. Hue keeps climbing past 360 so the path never doubles back through green.
 */
const STOPS: readonly Stop[] = [
  { at: 0, lightness: 0.5, chroma: 0.04, hue: 255 },
  { at: 0.3, lightness: 0.56, chroma: 0.11, hue: 300 },
  { at: 0.55, lightness: 0.64, chroma: 0.18, hue: 380 },
  { at: 0.8, lightness: 0.75, chroma: 0.17, hue: 415 },
  { at: FULL, lightness: 0.89, chroma: 0.14, hue: 450 },
  { at: SURGE_PEAK, lightness: 0.975, chroma: 0.07, hue: 462 },
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
  return 'oklch(0.975 0.07 102)';
}

/** The hottest ordinary thing: a first task in a fresh area, marked Important, done from cold. */
const REFERENCE_ITEM: Scorable = { areaId: 'reference', important: true, avoided: false, warmth: 0 };
const START_OF_DAY: DayPosition = { inArea: 0, areasOpened: 0 };

/** Below 1 this lifts small gains, so everyday items do not all crowd the cold end. */
const CURVE = 0.6;

/**
 * Turns the HEAT an item would add right now into a temperature from 0 to 1. The scale is
 * anchored to the engine, so retuning the numbers does not shift every colour. Items never
 * go past 1: the pale end of the gradient belongs to Surge alone.
 */
export function temperatureOf(gain: number, config: HeatConfig): number {
  const reference = applyGain(0, pointsFor(REFERENCE_ITEM, START_OF_DAY, config), config);
  return reference > 0 ? Math.pow(clamp(gain / reference, FULL), CURVE) : 0;
}
