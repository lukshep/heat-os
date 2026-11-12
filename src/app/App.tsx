import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { ID } from '../data/model';
import { inArea, type ListItem } from '../data/selectors';
import { Inbox } from '../screens/Inbox';
import { Projects } from '../screens/Projects';
import { Today } from '../screens/Today';
import { EdgeMeter } from '../ui/EdgeMeter';
import { PlusIcon } from '../ui/icons';
import { useActions } from './store';
import { useView } from './view';

// The condition is a build-time constant, so production builds drop the import and the whole dev/ folder.
const DevPanel = import.meta.env.DEV ? lazy(() => import('../dev/DevPanel')) : null;

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readHash(): string {
  return window.location.hash;
}

interface Props {
  /** False when this device cannot store data, so the user is told nothing will be kept. */
  saving: boolean;
}

export function App({ saving }: Props) {
  const hash = useSyncExternalStore(subscribeToHash, readHash);

  if (DevPanel && hash.startsWith('#/dev')) {
    return (
      <Suspense fallback={null}>
        <DevPanel />
      </Suspense>
    );
  }

  return <Shell saving={saving} />;
}

type Tab = 'today' | 'projects' | 'inbox';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

/** How long a completion can be taken back from the toast. */
const UNDO_MS = 6000;

function Shell({ saving }: Props) {
  const view = useView();
  const actions = useActions();
  const [tab, setTab] = useState<Tab>('today');
  const [undo, setUndo] = useState<{ completionId: ID; title: string } | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const hasInbox = inArea(view.items, null).length > 0;

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function complete(item: ListItem) {
    setUndo({ completionId: actions.complete(item), title: item.title });
  }

  function capture() {
    // The field has to exist and take focus inside this tap, or a phone will not raise its keyboard.
    flushSync(() => setTab('inbox'));
    captureRef.current?.focus();
  }

  return (
    <div className="app">
      {/* HEAT runs round the edge of every screen, so no screen needs a bar of its own. */}
      <EdgeMeter heat={view.heat.heat} threshold={view.config.threshold} />

      <header className="head">
        <h1 className={tab === 'today' ? 'head-word' : 'head-title'}>
          {tab === 'today' ? 'HEAT' : TABS.find((entry) => entry.id === tab)?.label}
        </h1>
      </header>

      <main className="main" key={tab}>
        {!saving && (
          <p className="notice" role="status">
            Storage is not available here, so nothing will be kept on this device.
          </p>
        )}
        {tab === 'today' && <Today view={view} onComplete={complete} />}
        {tab === 'projects' && <Projects view={view} onComplete={complete} />}
        {tab === 'inbox' && <Inbox view={view} onComplete={complete} captureRef={captureRef} />}
      </main>

      {undo && (
        <div className="toast" role="status">
          <span className="toast-text">Done: {undo.title}</span>
          <button
            type="button"
            onClick={() => {
              actions.undoCompletion(undo.completionId);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}

      <nav className="tabs" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className="tab"
            type="button"
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'inbox' && hasInbox && <span className="tab-dot" aria-label="has items" />}
          </button>
        ))}
        <button className="tabs-add" type="button" aria-label="Capture a task" onClick={capture}>
          <PlusIcon />
        </button>
      </nav>
    </div>
  );
}
