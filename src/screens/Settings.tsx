import { useRef, useState } from 'react';
import { exportBackup, readBackup } from '../app/backup';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { currentTuning, SETTING_LIMITS } from '../data/model';
import { COOLINGS, EFFORTS, type Cooling, type Effort } from '../heat/config';

const HOURS = Array.from(
  { length: SETTING_LIMITS.dayStartHour.max - SETTING_LIMITS.dayStartHour.min + 1 },
  (_, index) => SETTING_LIMITS.dayStartHour.min + index,
);

/** An hour of the day as this device writes it, such as "4 AM" or "04". */
function hourName(hour: number): string {
  if (hour === 0) return 'Midnight';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

interface Step {
  name: string;
  /** What choosing it means, said in the confirmation. Never a number. */
  effect: string;
}

const EFFORT_STEPS: Record<Effort, Step> = {
  easier: { name: 'Easier', effect: 'A lighter day will keep HEAT warm.' },
  standard: { name: 'Standard', effect: 'HEAT will warm at its usual rate.' },
  harder: { name: 'Harder', effect: 'It will take a fuller day to keep HEAT warm.' },
};

const COOLING_STEPS: Record<Cooling, Step> = {
  slower: { name: 'Slower', effect: 'HEAT will hold longer between active days.' },
  standard: { name: 'Standard', effect: 'HEAT will cool at its usual rate.' },
  faster: { name: 'Faster', effect: 'HEAT will fade sooner when you stop.' },
};

/**
 * A setting that changes how HEAT behaves. It asks first, because it changes what the edge
 * line means from then on; cancelling leaves the picker where it was.
 */
function StepPicker<T extends string>(props: {
  name: string;
  note: string;
  order: readonly T[];
  steps: Record<T, Step>;
  value: T;
  onPick: (step: T) => void;
}) {
  function pick(step: T) {
    const { name, effect } = props.steps[step];
    const question = `Set ${props.name} to ${name}?\n\n${effect} This applies from now on. HEAT you have already earned stays as it is.`;
    if (window.confirm(question)) props.onPick(step);
  }

  return (
    <label className="setting">
      <span className="setting-name">{props.name}</span>
      <select value={props.value} onChange={(event) => pick(event.target.value as T)}>
        {props.order.map((step) => (
          <option key={step} value={step}>
            {props.steps[step].name}
          </option>
        ))}
      </select>
      <span className="setting-note">{props.note}</span>
    </label>
  );
}

/** What a person can set for themselves, the backup that carries their data, and the reset. */
export function Settings({ view }: { view: View }) {
  const actions = useActions();
  const { dayStartHour } = view.state.settings;
  const tuning = currentTuning(view.state.settings);
  const fileInput = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState('');

  function resetHeat() {
    const question =
      'Reset HEAT to cold?\n\nIt starts again from nothing. Your tasks and routines stay as they are. This cannot be undone.';
    if (window.confirm(question)) actions.resetHeat();
  }

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

      <StepPicker
        name="Effort"
        note="How much a day's work warms HEAT. Easier suits lighter days."
        order={EFFORTS}
        steps={EFFORT_STEPS}
        value={tuning.effort}
        onPick={(effort) => actions.tune({ ...tuning, effort })}
      />

      <StepPicker
        name="Cooling"
        note="How fast HEAT fades. Slower is kinder to days off."
        order={COOLINGS}
        steps={COOLING_STEPS}
        value={tuning.cooling}
        onPick={(cooling) => actions.tune({ ...tuning, cooling })}
      />

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

      <div className="setting">
        <span className="setting-name">Reset</span>
        <span className="setting-note">Start HEAT again from cold. Your tasks and routines stay as they are.</span>
        <button className="text-button is-danger" type="button" onClick={resetHeat}>
          Reset HEAT
        </button>
      </div>
    </div>
  );
}
