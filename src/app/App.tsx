import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { ID } from '../data/model';
import { inArea, type ListItem } from '../data/selectors';
import { Inbox } from '../screens/Inbox';
import { Projects } from '../screens/Projects';
import { Settings } from '../screens/Settings';
import { Today } from '../screens/Today';
import { EdgeMeter } from '../ui/EdgeMeter';
import { InboxIcon, PlusIcon, ProjectsIcon, SettingsIcon, TodayIcon } from '../ui/icons';
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

type Tab = 'today' | 'projects' | 'inbox' | 'settings';

/** The tab bar shows icons only, so each tab's name is its accessible label and its screen's heading. */
const TABS: { id: Tab; label: string; Icon: () => ReactNode }[] = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'projects', label: 'Projects', Icon: ProjectsIcon },
  { id: 'inbox', label: 'Inbox', Icon: InboxIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];
/** The plus button sits in the middle, with this many tabs before it. */
const TABS_BEFORE_PLUS = 2;

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

  function tabButton({ id, label, Icon }: (typeof TABS)[number]) {
    const waiting = id === 'inbox' && hasInbox;
    return (
      <button
        key={id}
        className="tab"
        type="button"
        aria-label={waiting ? `${label}, with items waiting` : label}
        aria-current={tab === id ? 'page' : undefined}
        onClick={() => setTab(id)}
      >
        <Icon />
        {waiting && <span className="tab-dot" />}
      </button>
    );
  }

  return (
    <div className="app">
      {/* HEAT runs round the edge of every screen, so no screen needs a bar of its own. */}
      <EdgeMeter heat={view.heat.heat} threshold={view.config.threshold} />

      <header className="head">
        <h1 className="head-title">{TABS.find((entry) => entry.id === tab)?.label}</h1>
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
        {tab === 'settings' && <Settings view={view} />}
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
        {TABS.slice(0, TABS_BEFORE_PLUS).map(tabButton)}
        <button className="tabs-add" type="button" aria-label="Capture a task" onClick={capture}>
          <PlusIcon />
        </button>
        {TABS.slice(TABS_BEFORE_PLUS).map(tabButton)}
      </nav>
    </div>
  );
}
