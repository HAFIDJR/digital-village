/**
 * Archive UI state.
 *
 * Kept apart from the live worklist slice on purpose: an officer who narrowed
 * the queue to "menunggu TTD Kades" ten minutes ago should not open the letter
 * archive and find it empty because of a filter they set somewhere else.
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { PAGE_SIZES } from "@/lib/validators";
import type { RequestStatus } from "@/db/schema";

export type ArchiveState = {
  q: string;
  statuses: RequestStatus[];
  dusun: string[];
  page: number;
  pageSize: number;
};

export const initialArchiveState: ArchiveState = {
  q: "",
  statuses: [],
  dusun: [],
  page: 1,
  pageSize: 25,
};

function resetPaging(state: ArchiveState) {
  state.page = 1;
}

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const archiveSlice = createSlice({
  name: "archive",
  initialState: initialArchiveState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload;
      resetPaging(state);
    },
    statusToggled(state, action: PayloadAction<RequestStatus>) {
      state.statuses = toggleValue(state.statuses, action.payload);
      resetPaging(state);
    },
    dusunToggled(state, action: PayloadAction<string>) {
      state.dusun = toggleValue(state.dusun, action.payload);
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
      resetPaging(state);
    },
  },
});

export const archiveActions = archiveSlice.actions;
export default archiveSlice.reducer;

export function activeArchiveFilterCount(state: ArchiveState) {
  return (state.q.trim() ? 1 : 0) + state.statuses.length + state.dusun.length;
}
