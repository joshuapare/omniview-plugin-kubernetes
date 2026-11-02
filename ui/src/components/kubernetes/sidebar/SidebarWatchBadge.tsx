import { Spinner } from '@omniviewdev/base-ui';
import type { SourceSessionState } from '@omniviewdev/runtime';
import React from 'react';

type States = Readonly<Record<string, SourceSessionState>>;
type Status = 'none' | 'syncing' | 'error';
type Listener = () => void;

function statusOf(state: SourceSessionState | undefined): Status {
  if (state === 'failed') return 'error';
  if (state === 'opening' || state === 'snapshotting' || state === 'resetRequired')
    return 'syncing';
  return 'none';
}

class WatchStore {
  private states: States;
  private listeners = new Map<string, Set<Listener>>();

  constructor(states: States = {}) {
    this.states = states;
  }

  update(states: States = {}) {
    const changed = new Set<Listener>();
    for (const [key, listeners] of this.listeners) {
      if (statusOf(this.states[key]) !== statusOf(states[key])) {
        for (const listener of listeners) changed.add(listener);
      }
    }
    this.states = states;
    for (const listener of changed) listener();
  }

  status(keys: readonly string[]): Status {
    let result: Status = 'none';
    for (const key of keys) {
      const status = statusOf(this.states[key]);
      if (status === 'error') return status;
      if (status === 'syncing') result = status;
    }
    return result;
  }

  subscribe(keys: readonly string[], listener: Listener) {
    for (const key of keys) {
      let listeners = this.listeners.get(key);
      if (!listeners) this.listeners.set(key, (listeners = new Set()));
      listeners.add(listener);
    }
    return () => {
      for (const key of keys) {
        const listeners = this.listeners.get(key);
        listeners?.delete(listener);
        if (!listeners?.size) this.listeners.delete(key);
      }
    };
  }
}

const emptyStore = new WatchStore();
const WatchContext = React.createContext(emptyStore);

export function SidebarSourceStateProvider({
  states,
  children,
}: {
  states?: States;
  children: React.ReactNode;
}) {
  const [store] = React.useState(() => new WatchStore(states));
  React.useLayoutEffect(() => store.update(states), [store, states]);
  return <WatchContext.Provider value={store}>{children}</WatchContext.Provider>;
}

const syncingStyle: React.CSSProperties = { width: 10, height: 10 };
const errorStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: 'var(--ov-color-danger)',
  flexShrink: 0,
};

export const SidebarWatchBadge = React.memo(function SidebarWatchBadge({
  resourceKeys,
}: {
  resourceKeys: readonly string[];
}) {
  const store = React.useContext(WatchContext);
  const subscribe = React.useCallback(
    (listener: Listener) => store.subscribe(resourceKeys, listener),
    [store, resourceKeys],
  );
  const snapshot = React.useCallback(() => store.status(resourceKeys), [store, resourceKeys]);
  const status = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  if (status === 'error')
    return <span role="img" aria-label="Resource watch error" style={errorStyle} />;
  if (status === 'syncing')
    return (
      <span role="status" aria-label="Resources syncing">
        <Spinner size="xs" color="brand" style={syncingStyle} />
      </span>
    );
  return null;
});
