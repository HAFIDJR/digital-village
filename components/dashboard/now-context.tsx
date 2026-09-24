"use client";

import * as React from "react";

/**
 * One clock for the whole dashboard.
 *
 * Every "10 menit lalu" on this screen has to be measured against the same
 * instant, or two panels render different ages for the same event — and reading
 * `Date.now()` while rendering is impure, which breaks React's ability to bail
 * out of re-renders and makes components non-deterministic.
 *
 * Implemented as an external store rather than provider state on purpose. The
 * dashboard chrome mounts *before* the first payload arrives, so the seed it can
 * offer at mount is 0; a `useState(seed)` provider would keep that 0 forever
 * (state initialisers only run once), and syncing it from an effect would fire a
 * second render pass on every refetch. A store can simply replace the seed when
 * the real instant shows up.
 */

type ClockStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
};

function createClockStore(seed: number, tickMs: number): ClockStore {
  // 0 means "not known yet" — the payload carrying `serverTime` has not landed.
  let current = seed > 0 ? seed : 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const publish = () => {
    current = Date.now();
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      // First subscriber after hydration with no server instant: start from the
      // browser clock rather than rendering 1970. React re-reads the snapshot
      // immediately after subscribing, so the corrected value is picked up.
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
    // Server render: the page is dynamic and renders the loading chrome, so the
    // seed is what the server itself saw. Consumers with real data only exist on
    // the client.
    getServerSnapshot: () => (seed > 0 ? seed : 0),
  };
}

const NowContext = React.createContext<ClockStore | null>(null);

export function NowProvider({
  initial,
  tickMs = 30_000,
  children,
}: {
  /** Instant to render first — the server's own timestamp for this payload. */
  initial: number;
  tickMs?: number;
  children: React.ReactNode;
}) {
  const store = React.useMemo(() => createClockStore(initial, tickMs), [initial, tickMs]);

  return <NowContext.Provider value={store}>{children}</NowContext.Provider>;
}

/**
 * The shared instant.
 *
 * Throws rather than falling back to a private clock: two clocks on one screen
 * is the bug this module exists to prevent, so a missing provider should fail
 * loudly during development instead of quietly rendering a second timeline.
 */
export function useNow(): number {
  const store = React.useContext(NowContext);
  if (!store) {
    throw new Error("useNow() requires a <NowProvider> ancestor (see dashboard-shell.tsx).");
  }
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
