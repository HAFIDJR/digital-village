/**
 * Reports workspace UI state.
 *
 * The landing dashboard and /laporan read the *same* slice: the filter an
 * officer sets on the summary screen is the filter they land on when they open
 * the full register, which is how a real counter handoff works. Server rows
 * stay in the RTK Query cache — this holds only "which slice of the reports are
 * we looking at".
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { PAGE_SIZES } from "@/lib/validators";
import type { ReportQuery } from "@/lib/validators";

export type ReportStatusFilter = NonNullable<ReportQuery["status"]>[number];
export type ReportCategoryFilter = NonNullable<ReportQuery["category"]>[number];
export type ReportSortFilter = ReportQuery["sort"];
export type ReportResponseFilter = ReportQuery["response"];

export type ReportsState = {
  q: string;
  statuses: ReportStatusFilter[];
  categories: ReportCategoryFilter[];
  dusun: string[];
  response: ReportResponseFilter;
  sort: ReportSortFilter;
  page: number;
  pageSize: number;
  /** Report opened in the detail drawer, or null. */
  selectedId: string | null;
};

export const initialReportsState: ReportsState = {
  q: "",
  statuses: [],
  categories: [],
  dusun: [],
  response: "all",
  sort: "newest",
  page: 1,
  pageSize: 10,
  selectedId: null,
};

/** Every filter change returns to page 1, or the officer lands on a blank page. */
function resetPaging(state: ReportsState) {
  state.page = 1;
}

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const reportsSlice = createSlice({
  name: "reports",
  initialState: initialReportsState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload;
      resetPaging(state);
    },
    statusToggled(state, action: PayloadAction<ReportStatusFilter>) {
      state.statuses = toggleValue(state.statuses, action.payload);
      resetPaging(state);
    },
    statusesReplaced(state, action: PayloadAction<ReportStatusFilter[]>) {
      state.statuses = action.payload;
      resetPaging(state);
    },
    categoryToggled(state, action: PayloadAction<ReportCategoryFilter>) {
      state.categories = toggleValue(state.categories, action.payload);
      resetPaging(state);
    },
    categoriesReplaced(state, action: PayloadAction<ReportCategoryFilter[]>) {
      state.categories = action.payload;
      resetPaging(state);
    },
    dusunToggled(state, action: PayloadAction<string>) {
      state.dusun = toggleValue(state.dusun, action.payload);
      resetPaging(state);
    },
    dusunReplaced(state, action: PayloadAction<string[]>) {
      state.dusun = action.payload;
      resetPaging(state);
    },
    responseChanged(state, action: PayloadAction<ReportResponseFilter>) {
      state.response = action.payload;
      resetPaging(state);
    },
    sortChanged(state, action: PayloadAction<ReportSortFilter>) {
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
    /** Preset used by the summary cards: "show me everything still open". */
    focusOpen(state) {
      state.statuses = ["NEW", "IN_PROGRESS"];
      state.response = "all";
      resetPaging(state);
    },
    /** Preset for the "belum ditanggapi" KPI: reports nobody has answered. */
    focusUnanswered(state) {
      state.statuses = [];
      state.response = "unanswered";
      resetPaging(state);
    },
    filtersCleared(state) {
      state.q = "";
      state.statuses = [];
      state.categories = [];
      state.dusun = [];
      state.response = "all";
      state.sort = "newest";
      resetPaging(state);
    },
    reportSelected(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
  },
});

export const reportsActions = reportsSlice.actions;
export default reportsSlice.reducer;

/** Number of active filters, for the "Bersihkan (n)" affordance. */
export function activeReportFilterCount(state: ReportsState) {
  return (
    (state.q.trim() ? 1 : 0) +
    state.statuses.length +
    state.categories.length +
    state.dusun.length +
    (state.response !== "all" ? 1 : 0)
  );
}
