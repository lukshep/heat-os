import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { ID } from '../data/model';
import { inArea, type ListItem } from '../data/selectors';
import { AreaHeading, Areas, areasOf } from '../screens/Areas';
import type { DayKey } from '../heat/day';
import { Inbox } from '../screens/Inbox';
import { Settings } from '../screens/Settings';
import { Today } from '../screens/Today';
import { fullDayName } from '../ui/dates';
import { EdgeMeter } from '../ui/EdgeMeter';
import { AreasIcon, InboxIcon, PlusIcon, SettingsIcon, TodayIcon } from '../ui/icons';
import { ItemSheet } from '../ui/ItemSheet';
import { useFullHeight } from './fullHeight';
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

type Tab = 'today' | 'areas' | 'inbox' | 'settings';

/** The tab bar shows icons only, so each tab's name is its accessible label and its screen's heading. */
const TABS: { id: Tab; label: string; Icon: () => ReactNode }[] = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'areas', label: 'Areas', Icon: AreasIcon },
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
  // A later day picked on Today's calendar. Today opens on today, so leaving it forgets the day,
  // and once the picked day comes round (or passes) Today is simply today again.
  const [pickedDay, setPickedDay] = useState<DayKey | null>(null);
  const day = pickedDay !== null && pickedDay > view.today ? pickedDay : view.today;
  // The area whose page is open on Areas, kept while other tabs are visited. An area that has
  // been deleted falls back to the overview.
  const [areaId, setAreaId] = useState<ID | null>(null);
  const [areaEditing, setAreaEditing] = useState(false);
  const areas = areasOf(view);
  const areaIndex = areas.findIndex((area) => area.id === areaId);
  const paging = tab === 'areas' && areaIndex >= 0;
  const [undo, setUndo] = useState<{ completionId: ID; title: string } | null>(null);
  // The item whose panel is open. It is found afresh each time, so the panel stays open while
  // the item moves to another list or turns from a task into a routine.
  const [editingId, setEditingId] = useState<ID | null>(null);
  const editing = editingId === null ? undefined : view.items.find((item) => item.id === editingId);
  const captureRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useFullHeight(frameRef);
  const hasInbox = inArea(view.items, null).length > 0;

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  // An item that has gone, once deleted, closes its panel, which stays closed if it comes back.
  useEffect(() => {
    if (editingId !== null && editing === undefined) setEditingId(null);
  }, [editingId, editing]);

  function complete(item: ListItem) {
    setUndo({ completionId: actions.complete(item), title: item.title });
  }

  function edit(item: ListItem) {
    setEditingId(item.id);
  }

  function showTab(id: Tab) {
    // Tapping Areas again, with an area open, goes back to the overview.
    if (id === 'areas' && tab === 'areas') openArea(null);
    setTab(id);
    setPickedDay(null);
  }

  function openArea(id: ID | null) {
    setAreaId(id);
    setAreaEditing(false);
  }

  function capture() {
    // The field has to exist and take focus inside this tap, or a phone will not raise its keyboard.
    flushSync(() => showTab('inbox'));
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
        onClick={() => showTab(id)}
      >
        <Icon />
        {waiting && <span className="tab-dot" />}
      </button>
    );
  }

  return (
    <div className="app" ref={frameRef}>
      {/* HEAT runs round the edge of every screen, so no screen needs a bar of its own. */}
      <EdgeMeter heat={view.heat.heat} />

      {/* While a panel is open, nothing behind it takes a tap, a key or a screen reader's attention. */}
      <header className="head" inert={editing !== undefined}>
        {paging ? (
          <AreaHeading
            areas={areas}
            index={areaIndex}
            editing={areaEditing}
            onEditing={setAreaEditing}
            onOpen={openArea}
          />
        ) : (
          <h1 className="head-title">
            {tab === 'today' && day !== view.today
              ? fullDayName(day, view.today)
              : TABS.find((entry) => entry.id === tab)?.label}
          </h1>
        )}
      </header>

      <main
        className={paging ? 'main is-paging' : 'main'}
        key={paging ? 'areas:pages' : tab}
        inert={editing !== undefined}
      >
        {!saving && (
          <p className="notice" role="status">
            Storage is not available here, so nothing will be kept on this device.
          </p>
        )}
        {tab === 'today' && (
          <Today view={view} onComplete={complete} onEdit={edit} day={day} onPickDay={setPickedDay} />
        )}
        {tab === 'areas' && (
          <Areas
            view={view}
            onComplete={complete}
            onEdit={edit}
            openAreaId={paging ? areaId : null}
            onOpen={openArea}
            editing={areaEditing}
            onEditing={setAreaEditing}
          />
        )}
        {tab === 'inbox' && <Inbox view={view} onComplete={complete} onEdit={edit} captureRef={captureRef} />}
        {tab === 'settings' && <Settings view={view} />}
      </main>

      {editing && (
        <ItemSheet
          key={editing.id}
          item={editing}
          places={view.places}
          today={view.today}
          onClose={() => setEditingId(null)}
          onUpdate={(patch) => actions.updateItem(editing, patch)}
          onSetSchedule={(schedule) => actions.setSchedule(editing, schedule)}
          onDelete={() => {
            actions.deleteItem(editing);
            setEditingId(null);
          }}
          onAddSubtask={(title) => actions.addSubtask(editing, title)}
          onRenameSubtask={(id, title) => actions.renameSubtask(editing, id, title)}
          onDeleteSubtask={(id) => actions.deleteSubtask(editing, id)}
          onToggleSubtask={(id) => actions.toggleSubtask(editing, id)}
        />
      )}

      {undo && (
        <div className="toast" role="status" inert={editing !== undefined}>
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

      <nav className="tabs" aria-label="Sections" inert={editing !== undefined}>
        {TABS.slice(0, TABS_BEFORE_PLUS).map(tabButton)}
        <button className="tabs-add" type="button" aria-label="Capture a task" onClick={capture}>
          <PlusIcon />
        </button>
        {TABS.slice(TABS_BEFORE_PLUS).map(tabButton)}
      </nav>
    </div>
  );
}
