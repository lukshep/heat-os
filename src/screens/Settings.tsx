import { useRef, useState } from 'react';
import { exportBackup, readBackup } from '../app/backup';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { SETTING_LIMITS } from '../data/model';

const HOURS = Array.from(
  { length: SETTING_LIMITS.dayStartHour.max - SETTING_LIMITS.dayStartHour.min + 1 },
  (_, index) => SETTING_LIMITS.dayStartHour.min + index,
);

/** An hour of the day as this device writes it, such as "4 AM" or "04". */
function hourName(hour: number): string {
  if (hour === 0) return 'Midnight';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

/** The one thing a person can set for themselves, and the backup that carries their data. */
export function Settings({ view }: { view: View }) {
  const actions = useActions();
  const { dayStartHour } = view.state.settings;
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
