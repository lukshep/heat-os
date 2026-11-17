import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useCollapsed } from '../app/collapsed';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import type { ID } from '../data/model';
import { itemsAt, type ListItem, type Place } from '../data/selectors';
import { AddInput } from '../ui/AddInput';
import { ChevronIcon, NewProjectIcon, PlusIcon } from '../ui/icons';
import { ItemList } from './ItemList';

interface Props {
  view: View;
  onComplete: (item: ListItem) => void;
  /** Opens an item's panel. */
  onEdit: (item: ListItem) => void;
  /** The area whose page is open, or null for the overview. */
  openAreaId: ID | null;
  /** Opens an area's page, or the overview for null. */
  onOpen: (areaId: ID | null) => void;
  /** Whether the open area's rename and delete panel is showing. Its name in the heading opens it. */
  editing: boolean;
  onEditing: (open: boolean) => void;
}

/** Every area, in order. */
export function areasOf(view: View): Place[] {
  return view.places.filter((place) => place.depth === 0);
}

/**
 * The Areas tab: an overview of the areas, and a page for each, side by side, that swipes to
 * the next. Nothing on either has a count or a colour of its own: an area's colour would cool
 * as it is worked, which would make the overview a record of the areas touched today.
 */
export function Areas(props: Props) {
  const areas = areasOf(props.view);
  const index = areas.findIndex((area) => area.id === props.openAreaId);
  if (index < 0) return <Overview view={props.view} areas={areas} onOpen={props.onOpen} />;
  return <AreaPager {...props} areas={areas} index={index} />;
}

function Overview({ view, areas, onOpen }: Pick<Props, 'view' | 'onOpen'> & { areas: readonly Place[] }) {
  const actions = useActions();
  return (
    <>
      {areas.length > 0 && (
        <ul className="area-list">
          {areas.map((area) => {
            const projects = view.places.filter((place) => place.areaId === area.id && place.depth === 1);
            return (
              <li key={area.id}>
                <button className="area-row" type="button" onClick={() => onOpen(area.id)}>
                  <span className="area-row-text">
                    <span className="area-row-name">{area.name}</span>
                    {projects.length > 0 && (
                      <span className="area-row-projects">{projects.map((project) => project.name).join(' · ')}</span>
                    )}
                  </span>
                  <ChevronIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="place-new">
        <AddInput placeholder="New area" onAdd={actions.addArea} />
      </div>
    </>
  );
}

/** How long the pager has to be still before the page it rests on counts as open. */
const SETTLE_MS = 120;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The area pages, one per screen width, that snap into place as they are swiped. The browser
 * does the swiping, so it has the phone's own feel. The open area follows the page the pager
 * comes to rest on, and the pager follows the open area when it is chosen some other way.
 */
function AreaPager(props: Props & { areas: readonly Place[]; index: number }) {
  const { areas, index, onOpen } = props;
  const pagerRef = useRef<HTMLDivElement>(null);
  const { collapsed, setCollapsed } = useCollapsed();

  // The latest values, for the scroll and key handlers, which outlive a render.
  const latest = useRef({ areas, index, onOpen });
  latest.current = { areas, index, onOpen };

  // Bring the open area into view: at once when the pager first appears, smoothly after that.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth === 0) return;
    const resting = Math.round(pager.scrollLeft / pager.clientWidth);
    if (resting !== index) {
      const smooth = placed.current && !prefersReducedMotion();
      pager.scrollTo({ left: index * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    }
    placed.current = true;
  }, [index]);

  // Once a swipe comes to rest, the page it rests on is the open area.
  const settle = useRef(0);
  function onScroll() {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const pager = pagerRef.current;
      if (!pager || pager.clientWidth === 0) return;
      const resting = Math.round(pager.scrollLeft / pager.clientWidth);
      const area = latest.current.areas[resting];
      if (area && resting !== latest.current.index) latest.current.onOpen(area.id);
    }, SETTLE_MS);
  }
  useEffect(() => () => window.clearTimeout(settle.current), []);

  // On a keyboard, the arrow keys move between areas, unless they are moving a cursor.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select') || target?.isContentEditable) return;
      const { areas: all, index: at, onOpen: open } = latest.current;
      const next = all[at + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      open(next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="pager-dots" aria-hidden="true">
        {areas.map((area, at) => (
          <span key={area.id} className={at === index ? 'is-current' : undefined} />
        ))}
      </div>
      <div className="pager" ref={pagerRef} onScroll={onScroll}>
        {areas.map((area, at) => (
          <AreaPage
            key={area.id}
            {...props}
            area={area}
            current={at === index}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        ))}
      </div>
    </>
  );
}

interface PageProps extends Props {
  area: Place;
  /** The page on screen. The others take no focus, so the keyboard stays on this one. */
  current: boolean;
  collapsed: ReadonlySet<ID>;
  setCollapsed: (id: ID, folded: boolean) => void;
}

/**
 * One area: a field for adding a task to it and a way to start a project, then its own
 * routines and tasks, then each of its projects as a section that folds shut.
 */
function AreaPage({
  area,
  view,
  onComplete,
  onEdit,
  editing,
  onEditing,
  current,
  collapsed,
  setCollapsed,
}: PageProps) {
  const actions = useActions();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [startingProject, setStartingProject] = useState(false);

  // The area is the page itself, so only the projects inside it fold, and an area folded on an
  // earlier build hides nothing here.
  const projects = view.places.filter(
    (place) =>
      place.areaId === area.id && place.depth > 0 && !place.ancestors.slice(1).some((id) => collapsed.has(id)),
  );

  return (
    <section className="page" aria-label={area.name} inert={!current}>
      {current && editing && <PlaceEditor place={area} view={view} onClose={() => onEditing(false)} />}

      <div className="area-add">
        <AddInput placeholder={`Add to ${area.name}`} onAdd={(title) => actions.addTask(title, area.id)} />
        <button
          className="area-new-project"
          type="button"
          aria-label={`New project in ${area.name}`}
          onClick={() => setStartingProject(true)}
        >
          <NewProjectIcon />
        </button>
      </div>
      {startingProject && (
        <AddInput
          autoFocus
          placeholder={`New project in ${area.name}`}
          onAdd={(name) => actions.addProject(name, area.id, null)}
          onDone={() => setStartingProject(false)}
        />
      )}

      <ItemList items={itemsAt(view.items, area)} view={view} onComplete={onComplete} onEdit={onEdit} routinesStay />

      {projects.map((place) => (
        <PlaceSection
          key={place.key}
          place={place}
          view={view}
          onComplete={onComplete}
          onEditItem={onEdit}
          folded={collapsed.has(place.id)}
          onFold={(folded) => setCollapsed(place.id, folded)}
          editing={editingKey === place.key}
          onEdit={(open) => setEditingKey(open ? place.key : null)}
          adding={addingTo === place.key}
          onAdding={(open) => setAddingTo(open ? place.key : null)}
        />
      ))}
    </section>
  );
}

/** The heading of an open area: back to the overview, its name, and on a desktop, the areas either side. */
export function AreaHeading({
  areas,
  index,
  editing,
  onEditing,
  onOpen,
}: Pick<Props, 'editing' | 'onEditing' | 'onOpen'> & { areas: readonly Place[]; index: number }) {
  const area = areas[index];
  const previous = areas[index - 1];
  const next = areas[index + 1];
  if (!area) return null;
  return (
    <>
      <button className="head-back" type="button" aria-label="All areas" onClick={() => onOpen(null)}>
        <ChevronIcon />
      </button>
      <h1 className="head-title">
        <button className="head-title-button" type="button" aria-expanded={editing} onClick={() => onEditing(!editing)}>
          {area.name}
        </button>
      </h1>
      <div className="head-steps">
        <button
          className="head-step is-back"
          type="button"
          aria-label={previous ? `Previous area: ${previous.name}` : 'No previous area'}
          disabled={!previous}
          onClick={() => previous && onOpen(previous.id)}
        >
          <ChevronIcon />
        </button>
        <button
          className="head-step"
          type="button"
          aria-label={next ? `Next area: ${next.name}` : 'No next area'}
          disabled={!next}
          onClick={() => next && onOpen(next.id)}
        >
          <ChevronIcon />
        </button>
      </div>
    </>
  );
}

interface SectionProps {
  place: Place;
  view: View;
  onComplete: (item: ListItem) => void;
  /** Opens an item's panel. `onEdit` is the section's own rename panel. */
  onEditItem: (item: ListItem) => void;
  folded: boolean;
  onFold: (folded: boolean) => void;
  editing: boolean;
  onEdit: (open: boolean) => void;
  adding: boolean;
  onAdding: (open: boolean) => void;
}

/** A project and what sits directly in it. Projects nest to any depth, each indented a step further. */
function PlaceSection(props: SectionProps) {
  const { place, view, folded, editing, adding } = props;
  const actions = useActions();
  const items = itemsAt(view.items, place);

  return (
    <section
      className="place is-project"
      // The area is the page, so a project directly in it is not indented.
      style={{ '--depth': place.depth - 1 } as CSSProperties}
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

      {editing && (
        <PlaceEditor
          place={place}
          view={view}
          onClose={() => props.onEdit(false)}
          // Open the section, or the new project would be created out of sight.
          onProjectAdded={() => props.onFold(false)}
        />
      )}

      {!folded && (
        <>
          <ItemList items={items} view={view} onComplete={props.onComplete} onEdit={props.onEditItem} routinesStay />
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

interface EditorProps {
  place: Place;
  view: View;
  onClose: () => void;
  /** Offers a field for starting a project inside this one, and is told when one is added. */
  onProjectAdded?: () => void;
}

/** Rename or delete an area or a project, and for a project, start one inside it. */
function PlaceEditor({ place, view, onClose, onProjectAdded }: EditorProps) {
  const actions = useActions();
  const [name, setName] = useState(place.name);
  const isArea = place.projectId === null;

  function rename() {
    if (name.trim()) {
      if (isArea) actions.renameArea(place.id, name);
      else actions.renameProject(place.id, name);
    }
    onClose();
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
    onClose();
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
      {onProjectAdded && (
        <AddInput
          placeholder={`New project in ${place.name}`}
          onAdd={(projectName) => {
            actions.addProject(projectName, place.areaId, place.projectId);
            onProjectAdded();
          }}
        />
      )}
    </div>
  );
}
