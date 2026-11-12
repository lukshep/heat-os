import { useRef, useState, type CSSProperties } from 'react';
import { exportBackup, readBackup } from '../app/backup';
import { useCollapsed } from '../app/collapsed';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { SETTING_LIMITS } from '../data/model';
import { itemsAt, type ListItem, type Place } from '../data/selectors';
import { MAX_HEAT } from '../heat/config';
import { AddInput } from '../ui/AddInput';
import { ChevronIcon, PlusIcon } from '../ui/icons';
import { ItemList } from './ItemList';

interface Props {
  view: View;
  onComplete: (item: ListItem) => void;
}

/**
 * The whole tree: every area, and projects nested to any depth inside it. Each is a section
 * that can be folded shut. Only one section is being renamed, and one added to, at a time.
 */
export function Projects({ view, onComplete }: Props) {
  const actions = useActions();
  const { collapsed, setCollapsed } = useCollapsed();
  const [editing, setEditing] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // A place is hidden while anything it sits inside is folded shut.
  const visible = view.places.filter((place) => !place.ancestors.some((id) => collapsed.has(id)));

  return (
    <>
      {visible.map((place) => (
        <PlaceSection
          key={place.key}
          place={place}
          view={view}
          onComplete={onComplete}
          folded={collapsed.has(place.id)}
          onFold={(folded) => setCollapsed(place.id, folded)}
          editing={editing === place.key}
          onEdit={(open) => setEditing(open ? place.key : null)}
          adding={addingTo === place.key}
          onAdding={(open) => setAddingTo(open ? place.key : null)}
        />
      ))}
      <div className="place-new">
        <AddInput placeholder="New area" onAdd={actions.addArea} />
      </div>
      <Settings view={view} />
    </>
  );
}

interface SectionProps extends Props {
  place: Place;
  folded: boolean;
  onFold: (folded: boolean) => void;
  editing: boolean;
  onEdit: (open: boolean) => void;
  adding: boolean;
  onAdding: (open: boolean) => void;
}

function PlaceSection(props: SectionProps) {
  const { place, view, folded, editing, adding } = props;
  const actions = useActions();
  const isArea = place.projectId === null;
  const items = itemsAt(view.items, place);

  return (
    <section
      className={isArea ? 'place is-area' : 'place is-project'}
      style={{ '--depth': place.depth } as CSSProperties}
      aria-label={place.label}
    >
      <div className="place-head">
        <button
          className="place-fold"
          type="button"
          aria-expanded={!folded}
          aria-label={`${folded ? 'Open' : 'Fold'} ${place.name}`}
          onClick={() => props.onFold(!folded)}
        >
          <ChevronIcon />
        </button>
        <button
          className="place-name"
          type="button"
          aria-label={`Edit ${place.name}`}
          onClick={() => props.onEdit(!editing)}
        >
          {place.name}
        </button>
        <button
          className="place-add"
          type="button"
          aria-label={`Add a task to ${place.name}`}
          onClick={() => {
            props.onFold(false);
            props.onAdding(true);
          }}
        >
          <PlusIcon />
        </button>
      </div>

      {editing && <PlaceEditor {...props} />}

      {!folded && (
        <>
          <ItemList items={items} view={view} onComplete={props.onComplete} routinesStay />
          {adding && (
            <AddInput
              autoFocus
              placeholder={`Add to ${place.name}`}
              onAdd={(title) => actions.addTask(title, place.areaId, place.projectId)}
              onDone={() => props.onAdding(false)}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Opens under a section's name: rename it, delete it, or start a project inside it. */
function PlaceEditor({ place, view, onEdit, onFold }: SectionProps) {
  const actions = useActions();
  const [name, setName] = useState(place.name);
  const isArea = place.projectId === null;

  function rename() {
    if (name.trim()) {
      if (isArea) actions.renameArea(place.id, name);
      else actions.renameProject(place.id, name);
    }
    onEdit(false);
  }

  function remove() {
    const parentId = place.ancestors[place.ancestors.length - 1];
    const parent = view.places.find((candidate) => candidate.id === parentId);
    const consequence = isArea
      ? 'Its projects go with it. Everything inside moves to the Inbox, and routines become one-off tasks.'
      : `Anything inside it moves up to ${parent?.name ?? 'its area'}.`;
    if (!window.confirm(`Delete ${place.name}? ${consequence}`)) return;
    if (isArea) actions.deleteArea(place.id);
    else actions.deleteProject(place.id);
    onEdit(false);
  }

  return (
    <div className="place-edit">
      <form
        className="place-edit-row"
        onSubmit={(event) => {
          event.preventDefault();
          rename();
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Name"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus
        />
        <button className="text-button" type="submit">
          Done
        </button>
        <button className="text-button is-danger" type="button" onClick={remove}>
          Delete
        </button>
      </form>
      <AddInput
        placeholder={`New project in ${place.name}`}
        onAdd={(projectName) => {
          actions.addProject(projectName, place.areaId, place.projectId);
          // Open the section, or the new project would be created out of sight.
          onFold(false);
        }}
      />
    </div>
  );
}

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
function Settings({ view }: { view: View }) {
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
    <footer className="settings">
      <h2 className="settings-title">Settings</h2>

      {/* No number is shown: the line itself moves on the bar at the top of the screen. */}
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
        <span className="setting-note">How much HEAT to aim for each day. Watch the mark move on the bar above.</span>
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
      </div>
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
    </footer>
  );
}
