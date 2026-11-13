import { useRef, useState } from 'react';
import { exportBackup, readBackup } from '../app/backup';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { SETTING_LIMITS } from '../data/model';
import { MAX_HEAT } from '../heat/config';

const HOURS = Array.from(
  { length: SETTING_LIMITS.dayStartHour.max - SETTING_LIMITS.dayStartHour.min + 1 },
  (_, index) => SETTING_LIMITS.dayStartHour.min + index,
);

/** An hour of the day as this device writes it, such as "4 AM" or "04". */
function hourName(hour: number): string {
  if (hour === 0) return 'Midnight';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

/** The two things a person can set for themselves, and the backup that carries their data. */
export function Settings({ view }: { view: View }) {
  const actions = useActions();
  const { threshold, dayStartHour } = view.state.settings;
  const fileInput = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState('');

  async function restore(file: File | undefined) {
    if (!file) return;
    const saved = await readBackup(file);
    if (!saved) return setProblem('That file is not a HEAT backup this version can read.');
    setProblem('');
    if (window.confirm('Replace everything on this device with the backup?')) actions.replaceState(saved);
  }

  return (
    <div className="settings">
      {/* No number is shown: the mark itself moves along the edge of the screen. */}
      <label className="setting">
        <span className="setting-name">The line</span>
        <input
          type="range"
          min={SETTING_LIMITS.threshold.min}
          max={SETTING_LIMITS.threshold.max}
          step={SETTING_LIMITS.threshold.step}
          value={threshold}
          aria-valuetext={`${threshold} of ${MAX_HEAT}`}
          onChange={(event) => actions.updateSettings({ threshold: Number(event.target.value) })}
        />
        <span className="setting-note">
          How much HEAT to aim for each day. Watch the mark move along the edge of the screen.
        </span>
      </label>

      <label className="setting">
        <span className="setting-name">A new day starts at</span>
        <select
          value={dayStartHour}
          onChange={(event) => actions.updateSettings({ dayStartHour: Number(event.target.value) })}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hourName(hour)}
            </option>
          ))}
        </select>
        <span className="setting-note">Anything done before then counts toward the day before.</span>
      </label>

      <div className="setting">
        <span className="setting-name">Backup</span>
        <span className="setting-note">
          Your data lives only on this device. Export a backup now and then, and import it to restore or to move to
          another device.
        </span>
        <div className="setting-actions">
          <button className="text-button" type="button" onClick={() => void exportBackup(view.state, view.today)}>
            Export backup
          </button>
          <button className="text-button" type="button" onClick={() => fileInput.current?.click()}>
            Import backup
          </button>
          {import.meta.env.DEV && (
            <a className="text-button" href="#/dev">
              Simulator
            </a>
          )}
        </div>
        {problem && (
          <p className="setting-note" role="alert">
            {problem}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void restore(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
