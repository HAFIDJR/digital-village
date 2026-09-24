/**
 * Chrome state — everything that is not the worklist itself.
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UiState = {
  commandOpen: boolean;
  notificationsOpen: boolean;
  /** Off-canvas navigation, used below `lg` where the sidebar does not fit. */
  navOpen: boolean;
  /** Desktop icon-rail mode for the sidebar. */
  navCollapsed: boolean;
  /** Announcement composer validation errors, keyed by field path. */
  announcementErrors: Record<string, string[]>;
  /** Transient confirmation banner, e.g. after approving a letter. */
  toast: { id: string; tone: "success" | "danger" | "info" | "warning"; title: string; body?: string } | null;
  /** The officer currently composing a signature ceremony, or null. */
  signingRequestId: string | null;
  /** Which attachment the reviewer has enlarged in the drawer. */
  previewAttachmentId: string | null;
  theme: "light";
};

export const initialUiState: UiState = {
  commandOpen: false,
  notificationsOpen: false,
  navOpen: false,
  navCollapsed: false,
  announcementErrors: {},
  toast: null,
  signingRequestId: null,
  previewAttachmentId: null,
  theme: "light",
};

const uiSlice = createSlice({
  name: "ui",
  initialState: initialUiState,
  reducers: {
    commandPaletteToggled(state, action: PayloadAction<boolean | undefined>) {
      state.commandOpen = action.payload ?? !state.commandOpen;
    },
    notificationsToggled(state, action: PayloadAction<boolean | undefined>) {
      state.notificationsOpen = action.payload ?? !state.notificationsOpen;
    },
    navToggled(state, action: PayloadAction<boolean | undefined>) {
      state.navOpen = action.payload ?? !state.navOpen;
    },
    navCollapsedToggled(state) {
      state.navCollapsed = !state.navCollapsed;
    },
    announcementErrorsSet(state, action: PayloadAction<Record<string, string[]>>) {
      state.announcementErrors = action.payload;
    },
    announcementErrorsCleared(state) {
      state.announcementErrors = {};
    },
    toastShown(state, action: PayloadAction<NonNullable<UiState["toast"]>>) {
      state.toast = action.payload;
    },
    toastDismissed(state) {
      state.toast = null;
    },
    signingStarted(state, action: PayloadAction<string>) {
      state.signingRequestId = action.payload;
    },
    signingCancelled(state) {
      state.signingRequestId = null;
    },
    attachmentPreviewed(state, action: PayloadAction<string | null>) {
      state.previewAttachmentId = action.payload;
    },
  },
});

export const uiActions = uiSlice.actions;
export default uiSlice.reducer;
