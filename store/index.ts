import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { useDispatch, useSelector } from "react-redux";

import { villageApi } from "./api";
import archiveReducer from "./archive-slice";
import queueReducer from "./queue-slice";
import registryReducer from "./registry-slice";
import reportsReducer from "./reports-slice";
import uiReducer from "./ui-slice";
import "dotenv/config";

export function makeStore() {
  return configureStore({
    reducer: {
      queue: queueReducer,
      reports: reportsReducer,
      registry: registryReducer,
      archive: archiveReducer,
      ui: uiReducer,
      [villageApi.reducerPath]: villageApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
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

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export function enableStoreListeners(store: AppStore) {
  setupListeners(store.dispatch);
}
export { villageApi };

