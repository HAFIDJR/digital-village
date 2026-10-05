"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { createAppStore, enableStoreListeners } from "@/store";

function createStoreOnce(){
    const store = createAppStore();
    enableStoreListeners(store)
    return store
}

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

