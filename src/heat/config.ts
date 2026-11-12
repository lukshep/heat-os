/** Every number that shapes HEAT. Nothing else in the engine or UI may hard-code a tunable. */
export interface HeatConfig {
  /** The line on the bar. The aim is to bring HEAT up to it at some point each day. */
  threshold: number;
  /** Share of HEAT that survives 24 hours without activity. 0.8 means 20% cooling per day. */
  dailyRetention: number;
  /** Points needed to close about 63% of the gap to 100. Larger means slower gains and a higher bar. */
  gainScale: number;
  /** Points for a plain task before any multiplier. */
  basePoints: number;
  /** Extra share of a plain task earned by the first completion in an area each day. */
  firstInAreaBonus: number;
  /** Share of that bonus kept by each further area opened the same day. */
  areaBonusDecay: number;
  /** Each further completion in the same area that day is worth this share of the one before. */
  repeatDecay: number;
  /** Added to the quality multiplier for an Important item. */
  importantBonus: number;
  /** Added to the quality multiplier for an Avoided item. */
  avoidedBonus: number;
  /** Share of the flag bonus kept by each further flagged completion the same day. */
  flagDecay: number;
  /** Added to the quality multiplier for a routine at full warmth. */
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
  threshold: 60,
  dailyRetention: 0.8,
  gainScale: 300,
  basePoints: 10,
  firstInAreaBonus: 0.5,
  areaBonusDecay: 0.7,
  repeatDecay: 0.8,
  importantBonus: 0.5,
  avoidedBonus: 0.5,
  flagDecay: 0.5,
  warmthBonus: 1,
  warmthStep: 0.25,
  missStep: 0.2,
  dayStartHour: 4,
};

/** The top of the scale. Part of the definition of HEAT, not a tunable. */
export const MAX_HEAT = 100;
