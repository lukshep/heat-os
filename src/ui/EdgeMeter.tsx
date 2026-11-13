import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MAX_HEAT } from '../heat/config';
import { edgePath, edgePoint, type EdgeShape } from './edgePath';
import { heatColor } from './temperature';

interface Props {
  heat: number;
  threshold: number;
}

/** A rise of at least this much makes the line flare. Cooling and tiny gains do not. */
const FLARE_STEP = 0.2;
/** Below this the line is too short to draw as anything but a stray dot. */
const COLD = 0.5;

/** How far inside the edge the line's centre sits. */
const INSET = 2;
/**
 * Corner radius of the line. A web app cannot ask a phone how round its screen is, so this
 * is a value judged by eye on a recent iPhone, with the line hard against the glass. In a
 * browser window the app is a plain column, which takes a gentler corner.
 */
const SCREEN_RADIUS = 52;
const WINDOW_RADIUS = 20;

/** True when installed on a phone, where the app is drawn right to the edges of the glass. */
function fillsPhoneScreen(): boolean {
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * HEAT as a line of light round the edge of the screen. It starts at the top centre and
 * grows clockwise, so halfway is the bottom centre and a full loop is 100. Its colour is
 * its temperature, a bright tip marks the leading end, and a dot on the edge is the line
 * to reach. It sits over every screen and takes no touches.
 */
export function EdgeMeter({ heat, threshold }: Props) {
  const level = Math.max(0, Math.min(MAX_HEAT, heat));
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [radius] = useState(() => (fillsPhoneScreen() ? SCREEN_RADIUS : WINDOW_RADIUS));

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  const shape: EdgeShape = { ...size, inset: INSET, radius };
  const path = edgePath(shape);
  const mark = edgePoint(shape, threshold / MAX_HEAT);
  // pathLength makes the path 100 long, so offsets are HEAT itself.
  const line = { strokeDasharray: `${MAX_HEAT} ${MAX_HEAT}`, strokeDashoffset: MAX_HEAT - level };
  const tip = { strokeDasharray: `0.001 ${MAX_HEAT}`, strokeDashoffset: -level };

  // The number is deliberately not shown. It is still announced for anyone who cannot see the line.
  return (
    <div
      ref={frame}
      className={level < COLD ? 'edge is-cold' : 'edge'}
      style={{ '--edge-color': heatColor(level / MAX_HEAT) } as CSSProperties}
      role="meter"
      aria-label="HEAT"
      aria-valuemin={0}
      aria-valuemax={MAX_HEAT}
      aria-valuenow={Math.round(level)}
      aria-valuetext={`${Math.round(level)} of ${MAX_HEAT}. The line is at ${threshold}.`}
    >
      {size.width > 0 && size.height > 0 && (
        <svg width={size.width} height={size.height} aria-hidden="true">
          <path className="edge-track" d={path} />
          {flares > 0 && <path key={flares} className="edge-flare" d={path} pathLength={MAX_HEAT} style={line} />}
          <path className="edge-line" d={path} pathLength={MAX_HEAT} style={line} />
          <path className="edge-tip" d={path} pathLength={MAX_HEAT} style={tip} />
          <circle
            key={`mark-${arrivals}`}
            className={arrivals > 0 ? 'edge-mark is-reached' : 'edge-mark'}
            cx={mark.x}
            cy={mark.y}
            r={3.5}
          />
        </svg>
      )}
    </div>
  );
}
