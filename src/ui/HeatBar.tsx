import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MAX_HEAT } from '../heat/config';
import { HEAT_GRADIENT } from './temperature';

interface Props {
  heat: number;
  threshold: number;
  /** The large bar on Today, or the slim strip kept in view on the other screens. */
  size: 'hero' | 'slim';
}

/** A rise of at least this much makes the bar flare. Cooling and tiny gains do not. */
const FLARE_STEP = 0.2;

export function HeatBar({ heat, threshold, size }: Props) {
  const level = Math.max(0, Math.min(MAX_HEAT, heat));
  const previous = useRef({ level, threshold });
  const [flares, setFlares] = useState(0);
  const [arrivals, setArrivals] = useState(0);

  useEffect(() => {
    const before = previous.current;
    previous.current = { level, threshold };
    const rose = level - before.level >= FLARE_STEP;
    if (rose) setFlares((count) => count + 1);
    // The mark answers only when HEAT climbs to it, never because the mark was moved.
    if (rose && before.threshold === threshold && before.level < threshold && level >= threshold) {
      setArrivals((count) => count + 1);
    }
  }, [level, threshold]);

  const style = {
    '--heat-gradient': HEAT_GRADIENT,
    '--heat-clip': `inset(0 ${(MAX_HEAT - level).toFixed(2)}% 0 0 round 999px)`,
    '--heat-line': `${threshold}%`,
  } as CSSProperties;

  // The number is deliberately not shown. It is still announced for anyone who cannot see the bar.
  return (
    <div
      className={`heat-bar is-${size}`}
      style={style}
      role="meter"
      aria-label="HEAT"
      aria-valuemin={0}
      aria-valuemax={MAX_HEAT}
      aria-valuenow={Math.round(level)}
      aria-valuetext={`${Math.round(level)} of ${MAX_HEAT}. The line is at ${threshold}.`}
    >
      <div key={`glow-${flares}`} className={flares > 0 ? 'heat-bar-glow is-flaring' : 'heat-bar-glow'}>
        <div className="heat-bar-fill" />
      </div>
      <div className="heat-bar-track">
        <div className="heat-bar-fill" />
      </div>
      <div key={`line-${arrivals}`} className={arrivals > 0 ? 'heat-bar-line is-reached' : 'heat-bar-line'} />
    </div>
  );
}
