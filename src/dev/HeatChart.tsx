import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MAX_HEAT } from '../heat/config';
import type { SimSample } from '../heat/sim';

interface Props {
  samples: readonly SimSample[];
  /** The same scenario under the default config, drawn for comparison when the config has been changed. */
  baseline: readonly SimSample[] | null;
  threshold: number;
  days: number;
}

const HEIGHT = 300;
const MARGIN = { top: 16, right: 44, bottom: 42, left: 36 };
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const Y_TICKS = [0, 25, 50, 75, 100];
/** A regular tick label this close to the threshold's own label is dropped rather than overlapped. */
const TICK_CLEARANCE = 6;
const X_STEPS = [1, 2, 7, 14, 28, 56, 91, 182];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Index of the sample closest in time to `day`. */
function nearestIndex(samples: readonly SimSample[], day: number): number {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((samples[middle]?.day ?? 0) < day) low = middle + 1;
    else high = middle;
  }
  const before = samples[low - 1];
  const after = samples[low];
  return before && after && day - before.day < after.day - day ? low - 1 : low;
}

function yFor(heat: number): number {
  return MARGIN.top + (1 - heat / MAX_HEAT) * PLOT_HEIGHT;
}

function linePath(samples: readonly SimSample[], days: number, plotWidth: number): string {
  let path = '';
  for (const sample of samples) {
    const x = MARGIN.left + (days > 0 ? sample.day / days : 0) * plotWidth;
    path += `${path ? 'L' : 'M'}${x.toFixed(1)},${yFor(sample.heat).toFixed(1)}`;
  }
  return path;
}

function formatMoment(day: number): string {
  const minutes = Math.round(day * 1440);
  const hour = String(Math.floor((minutes % 1440) / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `Day ${Math.floor(minutes / 1440)}, ${hour}:${minute}`;
}

export function HeatChart({ samples, baseline, threshold, days }: Props) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const xFor = (day: number) => MARGIN.left + (days > 0 ? day / days : 0) * plotWidth;

  const path = useMemo(() => linePath(samples, days, plotWidth), [samples, days, plotWidth]);
  const baselinePath = useMemo(
    () => (baseline ? linePath(baseline, days, plotWidth) : null),
    [baseline, days, plotWidth],
  );

  const maxTicks = Math.max(3, Math.floor(plotWidth / 64));
  const step = X_STEPS.find((candidate) => days / candidate <= maxTicks) ?? 365;
  const xTicks: number[] = [];
  for (let day = 0; day <= days; day += step) xTicks.push(day);

  const lastIndex = samples.length - 1;
  const last = samples[lastIndex];
  const current = active === null ? undefined : samples[Math.min(active, lastIndex)];
  const compared = current && baseline ? baseline[nearestIndex(baseline, current.day)] : undefined;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (plotWidth <= 0 || lastIndex < 0) return;
    const offset = event.clientX - event.currentTarget.getBoundingClientRect().left - MARGIN.left;
    const day = Math.max(0, Math.min(days, (offset / plotWidth) * days));
    setActive(nearestIndex(samples, day));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (lastIndex < 0) return;
    const jump = event.shiftKey ? 24 : 1;
    let move: (from: number) => number;
    if (event.key === 'ArrowLeft') move = (from) => from - jump;
    else if (event.key === 'ArrowRight') move = (from) => from + jump;
    else if (event.key === 'Home') move = () => 0;
    else if (event.key === 'End') move = () => lastIndex;
    else if (event.key === 'Escape') return setActive(null);
    else return;
    event.preventDefault();
    setActive((value) => Math.max(0, Math.min(lastIndex, move(value ?? lastIndex))));
  }

  const tipOnLeft = current !== undefined && xFor(current.day) > width / 2;

  return (
    <div
      className="chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`HEAT over ${days} simulated days. Use the arrow keys to read values.`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((value) => value ?? (lastIndex >= 0 ? lastIndex : null))}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
        >
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? 'chart-axis' : 'chart-grid'}
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              {Math.abs(tick - threshold) >= TICK_CLEARANCE && (
                <text className="chart-tick" x={MARGIN.left - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle">
                  {tick}
                </text>
              )}
            </g>
          ))}

          {xTicks.map((day) => (
            <text key={day} className="chart-tick" x={xFor(day)} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle">
              {day}
            </text>
          ))}
          <text className="chart-tick" x={MARGIN.left + plotWidth / 2} y={HEIGHT - 6} textAnchor="middle">
            Days
          </text>

          <line
            className="chart-threshold"
            x1={MARGIN.left}
            x2={MARGIN.left + plotWidth}
            y1={yFor(threshold)}
            y2={yFor(threshold)}
          />
          <text
            className="chart-tick is-threshold"
            x={MARGIN.left - 8}
            y={yFor(threshold)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {threshold}
          </text>

          {baselinePath && <path className="chart-line is-compare" d={baselinePath} />}
          <path className="chart-line" d={path} />

          {last && (
            <>
              <circle className="chart-dot" cx={xFor(last.day)} cy={yFor(last.heat)} r={4} />
              <text className="chart-end-label" x={xFor(last.day) + 10} y={yFor(last.heat)} dominantBaseline="middle">
                {Math.round(last.heat)}
              </text>
            </>
          )}

          {current && (
            <>
              <line
                className="chart-crosshair"
                x1={xFor(current.day)}
                x2={xFor(current.day)}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_HEIGHT}
              />
              {compared && (
                <circle className="chart-dot is-compare" cx={xFor(current.day)} cy={yFor(compared.heat)} r={4} />
              )}
              <circle className="chart-dot" cx={xFor(current.day)} cy={yFor(current.heat)} r={4} />
            </>
          )}
        </svg>
      )}

      {current && (
        <div
          className={tipOnLeft ? 'chart-tip is-left' : 'chart-tip'}
          style={{ left: xFor(current.day), top: MARGIN.top }}
          role="status"
        >
          <div className="chart-tip-moment">{formatMoment(current.day)}</div>
          <div className="chart-tip-row">
            <span className="chart-key" />
            <strong>{current.heat.toFixed(1)}</strong>
            <span>{baseline ? 'This config' : 'HEAT'}</span>
          </div>
          {compared && (
            <div className="chart-tip-row">
              <span className="chart-key is-compare" />
              <strong>{compared.heat.toFixed(1)}</strong>
              <span>Default config</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
