"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { createAppStore, enableStoreListeners } from "@/store";

/**
 * Builds the store exactly once per browser session.
 *
 * Deliberately not a module singleton: that would be shared across every request
 * in a server render, which is precisely the cross-request state leak that makes
 * dashboards show one officer's data to another. Created through `useState`'s
 * lazy initialiser so it is never rebuilt on re-render — and, unlike a ref, it
 * never has to be mutated during render.
 */
function createStoreOnce() {
  const store = createAppStore();
  // Refetch-on-focus and refetch-on-reconnect for RTK Query.
  enableStoreListeners(store);
  return store;
}

/** Client boundary for the whole app. */
export function Providers({ children }: { children: ReactNode }) {
  const [store] = useState(createStoreOnce);

  return (
    <Provider store={store}>
      <TooltipProvider delayDuration={400} skipDelayDuration={200}>
        {children}
      </TooltipProvider>
    </Provider>
  );
}
