/**
 * Population registry UI state — shared by /penduduk and /keluarga.
 *
 * `type` is part of the state rather than a route constant so that switching
 * between the two menus keeps the officer's search term and dusun filter while
 * resetting the parts that cannot carry over (resident statuses mean nothing for
 * a Kartu Keluarga row).
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { PAGE_SIZES } from "@/lib/validators";
import type { RegistryQuery } from "@/lib/validators";

export type RegistryType = RegistryQuery["type"];
export type RegistrySort = RegistryQuery["sort"];
export type ResidentStatusFilter = NonNullable<RegistryQuery["status"]>[number];

export type RegistryState = {
  type: RegistryType;
  q: string;
  statuses: ResidentStatusFilter[];
  dusun: string[];
  sort: RegistrySort;
  page: number;
  pageSize: number;
  /** Resident opened in the detail drawer, or null. */
  selectedId: string | null;
};

export const initialRegistryState: RegistryState = {
  type: "residents",
  q: "",
  statuses: [],
  dusun: [],
  sort: "name_asc",
  page: 1,
  // 25 rows: a registry lookup is usually a scroll-and-scan, not a single find.
  pageSize: 25,
  selectedId: null,
};

function resetPaging(state: RegistryState) {
  state.page = 1;
}

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const registrySlice = createSlice({
  name: "registry",
  initialState: initialRegistryState,
  reducers: {
    typeChanged(state, action: PayloadAction<RegistryType>) {
      state.type = action.payload;
      // Status filters are resident-only; carrying them into the family view
      // would silently filter nothing and confuse the empty state.
      state.statuses = [];
      state.sort = action.payload === "families" ? "name_asc" : state.sort;
      resetPaging(state);
    },
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload;
      resetPaging(state);
    },
    statusToggled(state, action: PayloadAction<ResidentStatusFilter>) {
      state.statuses = toggleValue(state.statuses, action.payload);
      resetPaging(state);
    },
    dusunToggled(state, action: PayloadAction<string>) {
      state.dusun = toggleValue(state.dusun, action.payload);
      resetPaging(state);
    },
    sortChanged(state, action: PayloadAction<RegistrySort>) {
      state.sort = action.payload;
      resetPaging(state);
    },
    pageChanged(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload);
    },
    pageSizeChanged(state, action: PayloadAction<number>) {
      if ((PAGE_SIZES as readonly number[]).includes(action.payload)) {
        state.pageSize = action.payload;
        resetPaging(state);
      }
    },
    filtersCleared(state) {
      state.q = "";
      state.statuses = [];
      state.dusun = [];
      state.sort = "name_asc";
      resetPaging(state);
    },
    residentSelected(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
  },
});

export const registryActions = registrySlice.actions;
export default registrySlice.reducer;

export function activeRegistryFilterCount(state: RegistryState) {
  return (
    (state.q.trim() ? 1 : 0) + state.statuses.length + state.dusun.length
  );
}
