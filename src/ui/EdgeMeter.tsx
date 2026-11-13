import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FULL_HEAT, MAX_HEAT } from '../heat/config';
import { edgePath, type EdgeShape } from './edgePath';
import { heatColor } from './temperature';

interface Props {
  heat: number;
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

/** The line's width when it is not surging, and how much the peak of Surge adds to it. */
const LINE_WIDTH = 4;
const SURGE_WIDTH = 5;

/*
 * Blurs, as standard deviations in pixels. They are SVG filters rather than CSS ones because
 * Safari ignores a CSS filter on a shape inside an SVG, which left the line with no glow on
 * an iPhone. The line's glow widens in Surge, by up to SURGE_GLOW at the peak.
 */
const GLOW = 3;
const SURGE_GLOW = 6;
const TIP_GLOW = 3.5;
const FLARE_BLUR = 7;
const SHIMMER_BLUR = 1.5;

/** True when installed on a phone, where the app is drawn right to the edges of the glass. */
function fillsPhoneScreen(): boolean {
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * HEAT as a line of light round the edge of the screen. It starts at the top centre and
 * grows clockwise, so halfway is the bottom centre and the loop closes at a full gauge. Its
 * colour is its temperature and a bright tip marks the leading end. There is no mark to
 * reach: the line is a gauge, not a target.
 *
 * Past full is Surge. The loop is closed, so the extra shows as intensity: the line
 * thickens, its glow widens, it pales towards white-hot, and a slow shimmer travels round
 * it. It sits over every screen and takes no touches.
 */
export function EdgeMeter({ heat }: Props) {
  const level = Math.max(0, Math.min(MAX_HEAT, heat));
  /** 0 at a full gauge or below, 1 at the ceiling. */
  const surge = Math.max(0, level - FULL_HEAT) / (MAX_HEAT - FULL_HEAT);
  const filled = Math.min(level, FULL_HEAT);

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

  const previous = useRef(level);
  const [flares, setFlares] = useState(0);

  useEffect(() => {
    if (level - previous.current >= FLARE_STEP) setFlares((count) => count + 1);
    previous.current = level;
  }, [level]);

  const shape: EdgeShape = { ...size, inset: INSET, radius };
  const path = edgePath(shape);
  // pathLength makes the path one full gauge long, so offsets are HEAT itself.
  const line = { strokeDasharray: `${FULL_HEAT} ${FULL_HEAT}`, strokeDashoffset: FULL_HEAT - filled };
  const tip = { strokeDasharray: `0.001 ${FULL_HEAT}`, strokeDashoffset: -filled };

  const className = ['edge', level < COLD && 'is-cold', surge > 0 && 'is-surging'].filter(Boolean).join(' ');
  const style = {
    '--edge-color': heatColor(level / FULL_HEAT),
    '--edge-width': `${(LINE_WIDTH + SURGE_WIDTH * surge).toFixed(2)}px`,
    '--edge-surge': surge.toFixed(3),
  } as CSSProperties;

  // The number is deliberately not shown. It is still announced for anyone who cannot see the line.
  return (
    <div
      ref={frame}
      className={className}
      style={style}
      role="meter"
      aria-label="HEAT"
      aria-valuemin={0}
      aria-valuemax={MAX_HEAT}
      aria-valuenow={Math.round(level)}
      aria-valuetext={
        surge > 0
          ? `${Math.round(level)}, in Surge. A full gauge is ${FULL_HEAT}.`
          : `${Math.round(level)} of ${FULL_HEAT}`
      }
    >
      {size.width > 0 && size.height > 0 && (
        <svg width={size.width} height={size.height} aria-hidden="true">
          {/* sRGB blends the way CSS filters do; the SVG default, linearRGB, gives a harsher halo. */}
          <defs>
            <filter id="edge-glow" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={(GLOW + SURGE_GLOW * surge).toFixed(2)} result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="edge-tip-glow" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={TIP_GLOW} />
            </filter>
            <filter id="edge-flare-blur" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={FLARE_BLUR} />
            </filter>
            <filter id="edge-shimmer-blur" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={SHIMMER_BLUR} />
            </filter>
          </defs>
          <path className="edge-track" d={path} />
          {flares > 0 && (
            <path
              key={flares}
              className="edge-flare"
              d={path}
              pathLength={FULL_HEAT}
              style={line}
              filter="url(#edge-flare-blur)"
            />
          )}
          <path className="edge-line" d={path} pathLength={FULL_HEAT} style={line} filter="url(#edge-glow)" />
          <g className="edge-tip">
            <path className="edge-tip-glow" d={path} pathLength={FULL_HEAT} style={tip} filter="url(#edge-tip-glow)" />
            <path className="edge-tip-dot" d={path} pathLength={FULL_HEAT} style={tip} />
          </g>
          {surge > 0 && (
            <path className="edge-shimmer" d={path} pathLength={FULL_HEAT} filter="url(#edge-shimmer-blur)" />
          )}
        </svg>
      )}
    </div>
  );
}
