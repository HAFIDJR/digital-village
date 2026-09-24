/**
 * Queue UI state.
 *
 * This slice owns *how the worklist is being looked at* — filters, sorting,
 * pagination and the row that is open in the review drawer. It deliberately
 * holds no server data: rows live in the RTK Query cache, so a filter change
 * fetches with the new argument instead of imperatively mutating a list.
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { ALL_REQUEST_STATUSES } from "@/lib/domain";
import { PAGE_SIZES } from "@/lib/validators";
import type { RequestStatus } from "@/db/schema";

export type SlaFilter = "all" | "overdue" | "today";
export type QueueSort = "submitted_desc" | "submitted_asc" | "sla_asc" | "priority_desc";

export type QueueState = {
  search: string;
  statuses: RequestStatus[];
  letterTypes: string[];
  dusun: string[];
  sla: SlaFilter;
  sort: QueueSort;
  page: number;
  pageSize: number;
  /** Row currently open in the slide-over drawer, or null. */
  selectedRequestId: string | null;
  /** Row under keyboard focus, for arrow-key navigation of the table. */
  focusedIndex: number;
  /** Density toggle — power users ask to fit more rows on a 1080p screen. */
  density: "comfortable" | "compact";
};

/** A clean, common-case default: newest first, everything visible, 10 per page. */
export const initialQueueState: QueueState = {
  search: "",
  statuses: [],
  letterTypes: [],
  dusun: [],
  sla: "all",
  sort: "submitted_desc",
  page: 1,
  pageSize: 10,
  selectedRequestId: null,
  focusedIndex: 0,
  // Rapat (compact) is the default: the worklist is the primary workspace and
  // an eight-hour shift benefits from more rows on screen. "Nyaman" doubles the
  // row height for officers who prefer it.
  density: "compact",
};

/** Any filter change must return the user to page 1, or they land on an empty page. */
function resetPaging(state: QueueState) {
  state.page = 1;
  state.focusedIndex = 0;
}

/** Toggles a value inside one of the multi-select filter arrays. */
function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const queueSlice = createSlice({
  name: "queue",
  initialState: initialQueueState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.search = action.payload;
      resetPaging(state);
    },

    statusToggled(state, action: PayloadAction<RequestStatus>) {
      state.statuses = toggleValue(state.statuses, action.payload);
      resetPaging(state);
    },

    /** Used by the KPI cards, which deep-link into a pre-filtered worklist. */
    statusesReplaced(state, action: PayloadAction<RequestStatus[]>) {
      state.statuses = action.payload;
      resetPaging(state);
    },

    letterTypeToggled(state, action: PayloadAction<string>) {
      state.letterTypes = toggleValue(state.letterTypes, action.payload);
      resetPaging(state);
    },

    dusunToggled(state, action: PayloadAction<string>) {
      state.dusun = toggleValue(state.dusun, action.payload);
      resetPaging(state);
    },

    slaChanged(state, action: PayloadAction<SlaFilter>) {
      state.sla = action.payload;
      resetPaging(state);
    },

    sortChanged(state, action: PayloadAction<QueueSort>) {
      state.sort = action.payload;
      resetPaging(state);
    },

    pageChanged(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload);
    },

    pageSizeChanged(state, action: PayloadAction<number>) {
      // Only the sizes the API accepts, so the request can never 400.
      if ((PAGE_SIZES as readonly number[]).includes(action.payload)) {
        state.pageSize = action.payload;
        resetPaging(state);
      }
    },

    /** Quick preset used by the "Belum Diproses" KPI card and the filter rail. */
    focusUnprocessed(state) {
      state.statuses = ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP"];
      state.sla = "all";
      state.letterTypes = [];
      state.dusun = [];
      resetPaging(state);
    },

    showOnlyOverdue(state) {
      state.statuses = ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DIVERIFIKASI", "MENUNGGU_TTD_KADES"];
      state.sla = "overdue";
      resetPaging(state);
    },

    filtersCleared(state) {
      state.search = "";
      state.statuses = [];
      state.letterTypes = [];
      state.dusun = [];
      state.sla = "all";
      resetPaging(state);
    },

    requestSelected(state, action: PayloadAction<string | null>) {
      state.selectedRequestId = action.payload;
    },

    focusedIndexChanged(state, action: PayloadAction<number>) {
      state.focusedIndex = action.payload;
    },

    densityToggled(state) {
      state.density = state.density === "comfortable" ? "compact" : "comfortable";
    },
  },
});

export const queueActions = queueSlice.actions;

/** True when at least one filter narrows the worklist. */
export function hasActiveFilters(state: QueueState) {
  return (
    state.search.trim().length > 0 ||
    state.statuses.length > 0 ||
    state.letterTypes.length > 0 ||
    state.dusun.length > 0 ||
    state.sla !== "all"
  );
}

export function activeFilterCount(state: QueueState) {
  return (
    state.statuses.length +
    state.letterTypes.length +
    state.dusun.length +
    (state.sla !== "all" ? 1 : 0)
  );
}

export const ALL_STATUSES = ALL_REQUEST_STATUSES;

export default queueSlice.reducer;
