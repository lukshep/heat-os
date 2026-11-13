import { useState, type CSSProperties } from 'react';
import { useCollapsed } from '../app/collapsed';
import { useActions } from '../app/store';
import type { View } from '../app/view';
import { itemsAt, type ListItem, type Place } from '../data/selectors';
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
