import { useMemo, useState } from 'react';
import { DEFAULT_CONFIG, FULL_HEAT, MAX_HEAT, type HeatConfig } from '../heat/config';
import { SCENARIOS, simDayOf, simulate, type Scenario, type SimResult } from '../heat/sim';
import { HeatChart } from './HeatChart';
import './dev.css';

type ScenarioNumber = Exclude<keyof Scenario, 'name' | 'note'>;

interface ScenarioField {
  key: ScenarioNumber;
  label: string;
  min: number;
  max: number;
}

interface ConfigField {
  key: keyof HeatConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  /** A plainer reading of the value, shown beside it. */
  describe?: (value: number, config: HeatConfig) => string;
}

const SCENARIO_FIELDS: ScenarioField[] = [
  { key: 'daysOn', label: 'Days on', min: 1, max: 60 },
  { key: 'daysOff', label: 'Days off', min: 0, max: 60 },
  { key: 'areas', label: 'Areas touched', min: 1, max: 12 },
  { key: 'tasks', label: 'Tasks a day', min: 0, max: 100 },
  { key: 'important', label: 'Important', min: 0, max: 100 },
  { key: 'avoided', label: 'Avoided', min: 0, max: 100 },
  { key: 'routines', label: 'Daily routines', min: 0, max: 12 },
  { key: 'skipRoutinesEvery', label: 'Skip routines every', min: 0, max: 30 },
  { key: 'fromHour', label: 'From hour', min: 0, max: 23 },
  { key: 'toHour', label: 'To hour', min: 0, max: 23 },
];

/** The daily peak a consistent, balanced day is meant to settle at. */
const BALANCED_PEAK = 85;

/**
 * Points a day that hold HEAT at a given daily peak: enough to climb back to it after a
 * day's cooling. This is what the gain scale really sets.
 */
function pointsToHold(peak: number, config: HeatConfig): number {
  const gapAtPeak = MAX_HEAT - peak;
  const gapAfterCooling = MAX_HEAT - peak * config.dailyRetention;
  return gapAtPeak > 0 ? config.gainScale * Math.log(gapAfterCooling / gapAtPeak) : 0;
}

/** Share of warmth lost to the first, second and third miss in a row. */
function missShares(missStep: number): string {
  return [1, 2, 3].map((run) => `${Math.round(Math.min(1, missStep * run * run) * 100)}%`).join(', ');
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: 'dailyRetention',
    label: 'Daily retention',
    min: 0.5,
    max: 1,
    step: 0.01,
    describe: (value) => `${Math.round((1 - value) * 100)}% cooling a day`,
  },
  {
    key: 'surgeRetention',
    label: 'Retention in Surge',
    min: 0.5,
    max: 1,
    step: 0.01,
    describe: (value) => `${Math.round((1 - value) * 100)}% cooling a day above ${FULL_HEAT}`,
  },
  {
    key: 'gainScale',
    label: 'Gain scale',
    min: 50,
    max: 600,
    step: 5,
    describe: (_value, config) => `${Math.round(pointsToHold(BALANCED_PEAK, config))} points a day holds ${BALANCED_PEAK}`,
  },
  { key: 'basePoints', label: 'Base points', min: 1, max: 30, step: 1 },
  { key: 'firstInAreaBonus', label: 'First-in-area bonus', min: 0, max: 2, step: 0.05 },
  { key: 'areaBonusDecay', label: 'Bonus kept per further area', min: 0, max: 1, step: 0.05 },
  { key: 'repeatDecay', label: 'Kept per further task in area', min: 0, max: 0.95, step: 0.05 },
  {
    key: 'importantBonus',
    label: 'Important, flat extra',
    min: 0,
    max: 2,
    step: 0.05,
    describe: (value, config) => `${(value * config.basePoints).toFixed(1)} points, never diminished`,
  },
  {
    key: 'avoidedBonus',
    label: 'Avoided, flat extra',
    min: 0,
    max: 2,
    step: 0.05,
    describe: (value, config) => `${(value * config.basePoints).toFixed(1)} points, never diminished`,
  },
  { key: 'warmthBonus', label: 'Full-warmth bonus', min: 0, max: 3, step: 0.1 },
  { key: 'warmthStep', label: 'Warmth gap closed per completion', min: 0.05, max: 1, step: 0.05 },
  {
    key: 'missStep',
    label: 'Warmth lost to a miss',
    min: 0,
    max: 1,
    step: 0.05,
    describe: (value) => `then ${missShares(value)}`,
  },
  {
    key: 'dayStartHour',
    label: 'Day starts at',
    min: 0,
    max: 8,
    step: 1,
    describe: (value) => `${String(value).padStart(2, '0')}:00`,
  },
];

const MIN_DAYS = 7;
const MAX_DAYS = 365;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatFor(step: number): (value: number) => string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (value) => value.toFixed(decimals);
}

interface DayRow {
  day: number;
  low: number;
  peak: number;
  points: number;
}

function dailyRows(result: SimResult, days: number): DayRow[] {
  const rows: DayRow[] = Array.from({ length: days }, (_, day) => ({ day, low: Infinity, peak: 0, points: 0 }));
  for (const sample of result.samples) {
    const row = rows[Math.min(days - 1, Math.floor(sample.day))];
    if (!row) continue;
    row.low = Math.min(row.low, sample.heat);
    row.peak = Math.max(row.peak, sample.heat);
  }
  for (const entry of result.scored) {
    const row = rows[Math.floor(simDayOf(entry.fact.at))];
    if (row) row.points += entry.points;
  }
  return rows;
}

function Stat({ label, value, was }: { label: string; value: string; was?: string | undefined }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {was !== undefined && was !== value && <div className="stat-was">default {was}</div>}
    </div>
  );
}

function describeStats(result: SimResult) {
  const { stats } = result;
  return {
    peak: stats.settledPeak.toFixed(1),
    low: stats.settledLow.toFixed(1),
    surge: `${Math.round(stats.surgeShare * 100)}%`,
    points: stats.pointsPerActiveDay.toFixed(1),
    warmth: stats.routineWarmth === null ? null : stats.routineWarmth.toFixed(2),
  };
}

export default function DevPanel() {
  const [presetIndex, setPresetIndex] = useState(0);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [days, setDays] = useState(42);
  const [config, setConfig] = useState<HeatConfig>(DEFAULT_CONFIG);
  const [copied, setCopied] = useState(false);

  const isDefault = CONFIG_FIELDS.every((field) => config[field.key] === DEFAULT_CONFIG[field.key]);
  const result = useMemo(() => simulate(scenario, config, days), [scenario, config, days]);
  const baseline = useMemo(
    () => (isDefault ? null : simulate(scenario, DEFAULT_CONFIG, days)),
    [isDefault, scenario, days],
  );
  const rows = useMemo(() => dailyRows(result, days), [result, days]);

  const now = describeStats(result);
  const before = baseline ? describeStats(baseline) : null;
  const preset = SCENARIOS[presetIndex];
  const edited = preset !== scenario;
  const configJson = JSON.stringify(config, null, 2);

  function choosePreset(index: number) {
    const next = SCENARIOS[index];
    if (!next) return;
    setPresetIndex(index);
    setScenario(next);
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the JSON is on the page to select by hand.
    }
  }

  return (
    <div className="dev">
      <header className="dev-header">
        <div>
          <h1>HEAT simulator</h1>
          <p>Plays a pattern of behaviour through the real engine. Development builds only.</p>
        </div>
        <a className="dev-button" href="#/">
          Back to app
        </a>
      </header>

      <section className="dev-card" aria-label="Scenario">
        <div className="dev-row">
          <label className="dev-field is-wide">
            <span>Scenario</span>
            <select value={presetIndex} onChange={(event) => choosePreset(Number(event.target.value))}>
              {SCENARIOS.map((option, index) => (
                <option key={option.name} value={index}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dev-field">
            <span>Simulated days</span>
            <input
              type="number"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={days}
              onChange={(event) => setDays(clamp(Math.round(Number(event.target.value)) || MIN_DAYS, MIN_DAYS, MAX_DAYS))}
            />
          </label>
          {SCENARIO_FIELDS.map((field) => (
            <label className="dev-field" key={field.key}>
              <span>{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={scenario[field.key]}
                onChange={(event) => {
                  const value = clamp(Math.round(Number(event.target.value)) || 0, field.min, field.max);
                  setScenario((current) => ({ ...current, [field.key]: value }));
                }}
              />
            </label>
          ))}
        </div>
        <p className="dev-note">
          {scenario.note}
          {edited && ' (Edited from the preset.)'}
        </p>
      </section>

      <div className="dev-columns">
        <div className="dev-results">
          <section className="dev-stats" aria-label="Summary">
            <Stat label="Settled peak" value={now.peak} was={before?.peak} />
            <Stat label="Settled low" value={now.low} was={before?.low} />
            <Stat label="Time in Surge" value={now.surge} was={before?.surge} />
            <Stat label="Points per active day" value={now.points} was={before?.points} />
            {now.warmth !== null && <Stat label="Routine warmth" value={now.warmth} was={before?.warmth ?? undefined} />}
          </section>
          <p className="dev-caption">
            Settled figures cover the final on/off cycle of the run, once the starting climb no longer matters. Surge
            is any time spent above a full gauge of {FULL_HEAT}.
          </p>

          <section className="dev-card" aria-label="HEAT over time">
            <div className="chart-head">
              <h2>HEAT over {days} days</h2>
              <ul className="chart-legend">
                {baseline && (
                  <>
                    <li>
                      <span className="chart-key" />
                      This config
                    </li>
                    <li>
                      <span className="chart-key is-compare" />
                      Default config
                    </li>
                  </>
                )}
                <li>
                  <span className="chart-key is-surge" />
                  Surge starts
                </li>
              </ul>
            </div>
            <HeatChart
              samples={result.samples}
              baseline={baseline?.samples ?? null}
              surgeAt={FULL_HEAT}
              days={days}
            />
            <details className="dev-details">
              <summary>Daily table</summary>
              <div className="dev-table-scroll">
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Low</th>
                      <th>Peak</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.day}>
                        <td>{row.day}</td>
                        <td>{Number.isFinite(row.low) ? row.low.toFixed(1) : '0.0'}</td>
                        <td>{row.peak.toFixed(1)}</td>
                        <td>{row.points.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </div>

        <aside className="dev-card dev-config" aria-label="Config">
          <div className="dev-config-head">
            <h2>Config</h2>
            <div className="dev-actions">
              <button className="dev-button" type="button" onClick={() => setConfig(DEFAULT_CONFIG)} disabled={isDefault}>
                Reset
              </button>
              <button className="dev-button" type="button" onClick={copyConfig}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {CONFIG_FIELDS.map((field) => {
            const format = formatFor(field.step);
            const value = config[field.key];
            const changed = value !== DEFAULT_CONFIG[field.key];
            return (
              <label className={changed ? 'dev-slider is-changed' : 'dev-slider'} key={field.key}>
                <span className="dev-slider-head">
                  <span>{field.label}</span>
                  <span className="dev-slider-value">{format(value)}</span>
                </span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setConfig((current) => ({ ...current, [field.key]: next }));
                  }}
                />
                {(field.describe || changed) && (
                  <span className="dev-slider-was">
                    {field.describe?.(value, config)}
                    {field.describe && changed && ' · '}
                    {changed && `default ${format(DEFAULT_CONFIG[field.key])}`}
                  </span>
                )}
              </label>
            );
          })}

          <details className="dev-details">
            <summary>Config as JSON</summary>
            <pre className="dev-json">{configJson}</pre>
          </details>
        </aside>
      </div>
    </div>
  );
}
