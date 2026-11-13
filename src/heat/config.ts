/** Every number that shapes HEAT. Nothing else in the engine or UI may hard-code a tunable. */
export interface HeatConfig {
  /** Share of HEAT that survives 24 hours without activity. 0.8 means 20% cooling per day. */
  dailyRetention: number;
  /**
   * The same, while HEAT is above FULL_HEAT. Higher than `dailyRetention`, so a Surge holds
   * its heat a little longer. It depends only on where HEAT is, so it cannot be triggered.
   */
  surgeRetention: number;
  /** Points needed to close about 63% of the gap to the ceiling. Larger means slower gains. */
  gainScale: number;
  /** Points for a plain task before any multiplier. */
  basePoints: number;
  /** Extra share of a plain task earned by the first completion in an area each day. */
  firstInAreaBonus: number;
  /** Share of that bonus kept by each further area opened the same day. */
  areaBonusDecay: number;
  /** Each further completion in the same area that day is worth this share of the one before. */
  repeatDecay: number;
  /** Flat extra for an Important item, as a share of a plain task. Never diminished. */
  importantBonus: number;
  /** Flat extra for an Avoided item, as a share of a plain task. Never diminished. */
  avoidedBonus: number;
  /** Added to an item's multiplier for a routine at full warmth. */
  warmthBonus: number;
  /** Share of the gap to full warmth closed by completing a routine on a scheduled day. */
  warmthStep: number;
  /**
   * Share of warmth lost by one missed scheduled day. The nth miss in a row loses
   * n squared times this, up to all of it.
   */
  missStep: number;
  /** Local hour at which a new day begins for area bonuses and routine schedules. */
  dayStartHour: number;
}

export const DEFAULT_CONFIG: HeatConfig = {
  dailyRetention: 0.8,
  surgeRetention: 0.85,
  gainScale: 215,
  basePoints: 10,
  firstInAreaBonus: 0.5,
  areaBonusDecay: 0.7,
  repeatDecay: 0.8,
  importantBonus: 0.75,
  avoidedBonus: 0.75,
  warmthBonus: 1,
  warmthStep: 0.25,
  missStep: 0.2,
  dayStartHour: 4,
};

/**
 * A full gauge. Reaching it is meant to be hard and uncommon, and anything above it is Surge.
 * Part of the definition of HEAT, not a tunable.
 */
export const FULL_HEAT = 100;

/** The ceiling gains approach but never reach. Surge is the stretch between FULL_HEAT and here. */
export const MAX_HEAT = 120;
