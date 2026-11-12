import { useRef, useState } from 'react';
import { exportBackup, readBackup } from '../app/backup';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { Area, Task } from '../data/model';
import { tasksIn } from '../data/selectors';
import { AddInput } from '../ui/AddInput';
import { TaskList } from './TaskList';

interface Props {
  view: View;
  onComplete: (task: Task) => void;
}

export function Projects({ view, onComplete }: Props) {
  const actions = useActions();

  return (
    <>
      {view.areas.map((area) => (
        <AreaSection key={area.id} area={area} view={view} onComplete={onComplete} />
      ))}
      <div className="area">
        <AddInput placeholder="New area" onAdd={actions.addArea} />
      </div>
      <Backup view={view} />
    </>
  );
}

function AreaSection({ area, view, onComplete }: Props & { area: Area }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const tasks = tasksIn(view.tasks, area.id);

  function finishRename() {
    if (name.trim()) actions.renameArea(area.id, name);
    else setName(area.name);
    setEditing(false);
  }

  function remove() {
    const warning = tasks.length > 0 ? ` Its ${tasks.length === 1 ? 'task moves' : 'tasks move'} to the Inbox.` : '';
    if (window.confirm(`Delete ${area.name}?${warning}`)) actions.deleteArea(area.id);
  }

  return (
    <section className="area" aria-label={area.name}>
      {editing ? (
        <form
          className="area-edit"
          onSubmit={(event) => {
            event.preventDefault();
            finishRename();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Area name"
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
      ) : (
        <button className="area-name" type="button" onClick={() => setEditing(true)} aria-label={`Edit ${area.name}`}>
          {area.name}
        </button>
      )}

      <TaskList tasks={tasks} view={view} onComplete={onComplete} />
      <AddInput placeholder={`Add to ${area.name}`} onAdd={(title) => actions.addTask(title, area.id)} />
    </section>
  );
}

function Backup({ view }: { view: View }) {
  const actions = useActions();
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
    <footer className="backup">
      <p>
        Your data lives only on this device. Export a backup now and then, and import it to restore or to move to
        another device.
      </p>
      <div className="backup-actions">
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
      {problem && <p role="alert">{problem}</p>}
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
