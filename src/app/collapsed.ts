import { useState } from 'react';
import type { ID } from '../data/model';

const KEY = 'heat.collapsed';

/**
 * Which areas and projects are folded shut on the Projects screen. This is how one device
 * likes its view, not data, so it lives in localStorage and stays out of the state document
 * and its backups.
 */
function read(): Set<ID> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id): id is ID => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function write(ids: ReadonlySet<ID>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Without storage the view simply opens fully expanded next time.
  }
}

export function useCollapsed(): { collapsed: ReadonlySet<ID>; setCollapsed: (id: ID, folded: boolean) => void } {
  const [collapsed, setIds] = useState<ReadonlySet<ID>>(read);

  function setCollapsed(id: ID, folded: boolean) {
    const next = new Set(collapsed);
    if (folded) next.add(id);
    else next.delete(id);
    setIds(next);
    write(next);
  }

  return { collapsed, setCollapsed };
}
