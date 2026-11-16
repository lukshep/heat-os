import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FULL_HEAT, MAX_HEAT } from '../heat/config';
import { edgePath, gradientPieces, type EdgeShape } from './edgePath';
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
const FLARE_BLUR = 7;
const SHIMMER_BLUR = 1.5;

/**
 * The bright leading end, as a length along the line in HEAT: the line's last stretch, no wider
 * than it, lit close to white. On an iPhone a unit is about 24 points, so it is about 12.
 */
const TIP_LENGTH = 0.5;

/** The tip: a stretch of the line TIP_LENGTH long that ends where the line ends. */
function tipAt(filled: number): CSSProperties {
  return { strokeDasharray: `${TIP_LENGTH} ${FULL_HEAT}`, strokeDashoffset: TIP_LENGTH - filled };
}

/**
 * How many pieces the gradient is drawn in. Each is a hundredth of the loop, about 24 points on
 * an iPhone, where the colour changes too little from one to the next to see a step.
 */
const GRADIENT_PIECES = 100;

/**
 * Whether HEAT has just gone over a full gauge, which plays the Surge sweep. Opening the app
 * already in Surge shows the closed loop with no sweep, as a flare only follows a gain.
 */
interface Sweep {
  /** Counts each time HEAT goes over a full gauge, so each one plays the sweep afresh. */
  count: number;
  /** HEAT was at or below a full gauge when last drawn. */
  below: boolean;
}

/** True when installed on a phone, where the app is drawn right to the edges of the glass. */
function fillsPhoneScreen(): boolean {
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * HEAT as a line of light round the edge of the screen. It starts at the top centre and
 * grows anticlockwise, down the left side first, so halfway is the bottom centre and the loop
 * closes at a full gauge. Its colour is its temperature, and its leading end is lit bright.
 * There is no mark to reach: the line is a gauge, not a target.
 *
 * Below full the line carries the whole gradient along its length, cold at the top centre and
 * warmer the further round it reaches, so its leading end is always the colour of HEAT now.
 *
 * Going past full plays the Surge sweep: a loop the colour of HEAT runs round from the top
 * centre, as wide as the line, with a bright tip that fades as it closes, and then covers the
 * gradient. In Surge the extra shows as intensity: the loop thickens, its glow widens, it pales
 * towards white-hot, and a slow shimmer travels round it. The line sits over every screen and
 * takes no touches.
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

  // Worked out while drawing, not after, so the loop never shows closed for a frame first.
  const [sweep, setSweep] = useState<Sweep>(() => ({ count: 0, below: level <= FULL_HEAT }));
  if (sweep.below && level > FULL_HEAT) setSweep({ count: sweep.count + 1, below: false });
  if (!sweep.below && level <= FULL_HEAT) setSweep({ count: sweep.count, below: true });

  const pieces = useMemo(() => gradientPieces(GRADIENT_PIECES), []);

  useEffect(() => {
    if (level - previous.current >= FLARE_STEP) setFlares((count) => count + 1);
    previous.current = level;
  }, [level]);

  const shape: EdgeShape = { ...size, inset: INSET, radius };
  const path = edgePath(shape);
  // pathLength makes the path one full gauge long, so offsets are HEAT itself.
  const line = { strokeDasharray: `${FULL_HEAT} ${FULL_HEAT}`, strokeDashoffset: FULL_HEAT - filled };

  const className = ['edge', level < COLD && 'is-cold', surge > 0 && 'is-surging'].filter(Boolean).join(' ');
  const style = {
    '--edge-color': heatColor(level / FULL_HEAT),
    '--edge-width': `${(LINE_WIDTH + SURGE_WIDTH * surge).toFixed(2)}px`,
    '--edge-surge': surge.toFixed(3),
    // A length, so the sweep's tip can move smoothly from one offset to another.
    '--edge-tip': `${TIP_LENGTH}px`,
  } as CSSProperties;
  const whole = { x: -INSET * 10, y: -INSET * 10, width: size.width + INSET * 20, height: size.height + INSET * 20 };

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
            <filter id="edge-flare-blur" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={FLARE_BLUR} />
            </filter>
            <filter id="edge-shimmer-blur" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={SHIMMER_BLUR} />
            </filter>
            {/* How far round HEAT reaches. It reveals the gradient, and moves as the line grows or cools. */}
            <mask id="edge-reach" maskUnits="userSpaceOnUse" {...whole}>
              <path className="edge-reach" d={path} pathLength={FULL_HEAT} style={line} />
            </mask>
            {/* The whole gradient, round the full loop. Pieces take their width from where they are used. */}
            <g id="edge-gradient">
              {pieces.map((piece) => (
                <path
                  key={piece.start}
                  className="edge-piece"
                  d={path}
                  pathLength={FULL_HEAT}
                  stroke={piece.color}
                  strokeDasharray={`${piece.length} ${2 * FULL_HEAT}`}
                  strokeDashoffset={-piece.start}
                />
              ))}
            </g>
          </defs>
          <path className="edge-track" d={path} />
          {flares > 0 &&
            (surge > 0 ? (
              <path
                key={flares}
                className="edge-flare"
                d={path}
                pathLength={FULL_HEAT}
                style={line}
                filter="url(#edge-flare-blur)"
              />
            ) : (
              <g key={flares} className="edge-flare" filter="url(#edge-flare-blur)">
                <use href="#edge-gradient" mask="url(#edge-reach)" />
              </g>
            ))}
          <g className="edge-line" filter="url(#edge-glow)">
            <use href="#edge-gradient" mask="url(#edge-reach)" />
          </g>
          <path className="edge-tip" d={path} pathLength={FULL_HEAT} style={tipAt(filled)} filter="url(#edge-glow)" />
          {surge > 0 && (
            // Keyed by the sweep, so each time HEAT goes over a full gauge the sweep plays again.
            <g key={sweep.count} className={sweep.count > 0 ? 'edge-surge is-sweeping' : 'edge-surge'}>
              <path className="edge-surge-line" d={path} pathLength={FULL_HEAT} filter="url(#edge-glow)" />
              <path className="edge-sweep-tip" d={path} pathLength={FULL_HEAT} filter="url(#edge-glow)" />
              <path className="edge-shimmer" d={path} pathLength={FULL_HEAT} filter="url(#edge-shimmer-blur)" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
