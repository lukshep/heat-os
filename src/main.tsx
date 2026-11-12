import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startClock } from './app/clock';
import { createActions, createStore, persist, StoreProvider } from './app/store';
import { createInitialState, type AppState } from './data/model';
import { createIndexedDbStorage, parseState, type StorageAdapter } from './data/storage';
import { DEFAULT_CONFIG } from './heat/config';
import './styles.css';

interface Boot {
  state: AppState;
  /** null when nothing can or should be saved. */
  storage: StorageAdapter | null;
}

async function boot(): Promise<Boot> {
  const fresh = () => createInitialState(Date.now(), () => crypto.randomUUID());
  try {
    const storage = createIndexedDbStorage();
    const raw = await storage.load();
    if (raw === null) return { state: fresh(), storage };
    const saved = parseState(raw);
    // Saved data this build cannot read is left alone: run without saving rather than overwrite it.
    return saved ? { state: saved, storage } : { state: fresh(), storage: null };
  } catch {
    return { state: fresh(), storage: null };
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

void boot().then(({ state, storage }) => {
  const store = createStore(state);
  if (storage) {
    persist(store, storage);
    // Ask the browser not to evict the data under storage pressure. It may say no.
    void navigator.storage?.persist?.().catch(() => undefined);
  }
  startClock();

  createRoot(root).render(
    <StrictMode>
      <StoreProvider store={store} actions={createActions(store, DEFAULT_CONFIG)}>
        <App saving={storage !== null} />
      </StoreProvider>
    </StrictMode>,
  );
});
