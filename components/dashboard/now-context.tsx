"use client";

import * as React from "react";

type ClockStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
};

function createClockStore(seed: number, tickMs: number): ClockStore {
  let current = seed > 0 ? seed : 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const publish = () => {
    current = Date.now();
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      if (current === 0) current = Date.now();
      listeners.add(listener);
      timer ??= setInterval(publish, tickMs);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => current,
    getServerSnapshot: () => (seed > 0 ? seed : 0),
  };
}

const NowContext = React.createContext<ClockStore | null>(null);

export function NowProvider({
  initial,
  tickMs = 30_000,
  children,
}: {
  initial: number;
  tickMs?: number;
  children: React.ReactNode;
}) {
  const store = React.useMemo(
    () => createClockStore(initial, tickMs),
    [initial, tickMs],
  );

  return <NowContext.Provider value={store}>{children}</NowContext.Provider>;
}

export function useNow() : number {
    const store = React.useContext(NowContext)
    if(!store){
        throw new Error("useNow() requires a <NowProvider> ancestor (see dashboard-shell.tsx).");
    }
     return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
