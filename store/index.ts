/**
 * Redux store.
 *
 * Two reducers of intent sit beside the RTK Query cache:
 *  - `queue` answers "which slice of the worklist is the officer looking at?";
 *  - `ui`    answers "what chrome is open right now?".
 *
 * Server data lives exclusively in `villageApi`. Nothing above duplicates it.
 */
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { useDispatch, useSelector } from "react-redux";

import { villageApi } from "./api";
import queueReducer from "./queue-slice";
import uiReducer from "./ui-slice";

export function makeStore() {
  return configureStore({
    reducer: {
      queue: queueReducer,
      ui: uiReducer,
      [villageApi.reducerPath]: villageApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
        // The queue receives a keystroke-driven search term; immutability checks
        // are still on, but the serialisability check is what we rely on.
        serializableCheck: true,
        immutableCheck: process.env.NODE_ENV !== "production",
      }).concat(villageApi.middleware),
    devTools: process.env.NODE_ENV !== "production",
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const createAppStore = makeStore;

/** Typed hooks — the only way components should touch the store. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Enables refetch-on-focus / refetch-on-reconnect for RTK Query. */
export function enableStoreListeners(store: AppStore) {
  setupListeners(store.dispatch);
}

export { villageApi };
