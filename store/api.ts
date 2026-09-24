/**
 * RTK Query API.
 *
 * One `fetchBaseQuery` wraps every route handler, so all server state in the UI
 * passes through a single cache with a single invalidation story. Components
 * never call `fetch` directly.
 *
 * Argument discipline: query arguments are plain, serialisable objects derived
 * from the Zod schemas in `lib/validators`. That keeps cache keys stable
 * (no object identity churn) and makes `refetchOnMountOrArgChange` meaningful.
 */
import { createApi, fetchBaseQuery, type BaseQueryFn } from "@reduxjs/toolkit/query/react";

import type {
  AnnouncementEntry,
  ArchivePage,
  AreaOverview,
  FamilyRow,
  LetterTypeEntry,
  NotificationEntry,
  QueuePage,
  RegistryPage,
  ReportPage,
  RequestDetail,
  ResidentRow,
  SearchResults,
  ShellPayload,
  SignatureQueueEntry,
  StaffMember,
  VillageProfile,
  WorkspaceOverview,
} from "@/db/queries";
import type {
  AnnouncementDraft,
  QueueQuery,
  RegistryQuery,
  ReportQuery,
  VerifyRequestInput,
} from "@/lib/validators";

/* -------------------------------------------------------------------------- */
/* Error shape                                                                 */
/* -------------------------------------------------------------------------- */

export type ApiError = {
  status: number | string;
  data?: { error?: { code: string; message: string; fields?: Record<string, string[]> } };
};

export function errorMessage(error: unknown): string {
  const apiError = error as ApiError | undefined;
  return (
    apiError?.data?.error?.message ??
    "Terjadi kesalahan saat menghubungi server desa. Periksa koneksi lalu coba lagi."
  );
}

export function errorFields(error: unknown): Record<string, string[]> {
  const apiError = error as ApiError | undefined;
  return apiError?.data?.error?.fields ?? {};
}

/** Serialises a QueueQuery into the flat comma-joined params the API accepts. */
function toQueueParams(query: Partial<QueueQuery>) {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 10,
    sort: query.sort ?? "submitted_desc",
    sla: query.sla ?? "all",
  };
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.status?.length) params.status = query.status.join(",");
  if (query.letterType?.length) params.letterType = query.letterType.join(",");
  if (query.dusun?.length) params.dusun = query.dusun.join(",");
  if (query.channel?.length) params.channel = query.channel.join(",");
  return params;
}

/** Serialises a ReportQuery into the flat params `/api/reports` accepts. */
function toReportParams(query: Partial<ReportQuery>) {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 10,
    sort: query.sort ?? "newest",
    response: query.response ?? "all",
  };
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.status?.length) params.status = query.status.join(",");
  if (query.category?.length) params.category = query.category.join(",");
  if (query.dusun?.length) params.dusun = query.dusun.join(",");
  return params;
}

/** Serialises a RegistryQuery into the flat params `/api/registry` accepts. */
function toRegistryParams(query: Partial<RegistryQuery>) {
  const params: Record<string, string | number> = {
    type: query.type ?? "residents",
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 25,
    sort: query.sort ?? "name_asc",
  };
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.status?.length) params.status = query.status.join(",");
  if (query.dusun?.length) params.dusun = query.dusun.join(",");
  return params;
}

/* -------------------------------------------------------------------------- */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  // Civil-service workstations run on a LAN behind a proxy; a cookie ride-along
  // keeps session handling available to a future auth layer.
  credentials: "same-origin",
  prepareHeaders: (headers) => {
    headers.set("Accept", "application/json");
    return headers;
  },
});

/** Normalises network failures into the same envelope the server uses. */
const baseQuery: BaseQueryFn = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && !result.error.data) {
    return {
      error: {
        status: result.error.status,
        data: {
          error: {
            code: "NETWORK_ERROR",
            message:
              "Tidak dapat menghubungi server desa. Pastikan jaringan kantor terhubung.",
          },
        },
      },
    };
  }
  return result;
};

/* -------------------------------------------------------------------------- */
/* Response types                                                              */
/* -------------------------------------------------------------------------- */

export type WorkspaceResponse = WorkspaceOverview;
export type RequestsResponse = QueuePage & { serverTime: string };
export type SearchResponse = SearchResults & { query: string };
export type NotificationsResponse = { notifications: NotificationEntry[]; unread: number };

export type ShellResponse = ShellPayload;

export type ReportsResponse = ReportPage & { query: ReportQuery; serverTime: string };

/** Residents and families share a page shape; `type` discriminates the rows. */
export type RegistryResponse =
  | (RegistryPage<ResidentRow> & { type: "residents"; query: RegistryQuery; serverTime: string })
  | (RegistryPage<FamilyRow> & { type: "families"; query: RegistryQuery; serverTime: string });

export type AreasResponse = AreaOverview & { serverTime: string };

export type StaffResponse = {
  village: VillageProfile;
  staff: StaffMember[];
  letterTypes: LetterTypeEntry[];
  serverTime: string;
};

export type ArchiveResponse = ArchivePage & { query: QueueQuery; serverTime: string };

export type SignaturesResponse = { entries: SignatureQueueEntry[]; serverTime: string };
export type AnnouncementsResponse = { announcements: AnnouncementEntry[] };

export type VerifyResponse = {
  ok: true;
  ticket: string;
  previousStatus: string;
  status: string;
  defectiveCount: number;
  letterTypeName: string;
};

export type SignResponse = {
  ok: true;
  ticket: string;
  status: string;
  certificateSerial: string;
  signerName: string;
  signedAt: string;
};

export type PrintResponse = string; // object URL created by the caller

export type PublishResponse = {
  ok: true;
  announcement: {
    id: string;
    title: string;
    slug: string;
    status: string;
    channel: string;
    publishAt: string | null;
  };
};

/* -------------------------------------------------------------------------- */
/* Tags                                                                        */
/* -------------------------------------------------------------------------- */

export const TAG = {
  Workspace: "Workspace",
  Queue: "Queue",
  Request: "Request",
  Activity: "Activity",
  Notifications: "Notifications",
  Announcements: "Announcements",
  Reports: "Reports",
  Registry: "Registry",
  Areas: "Areas",
  Staff: "Staff",
  Archive: "Archive",
  Signatures: "Signatures",
} as const;

type Tag =
  | typeof TAG.Workspace
  | typeof TAG.Queue
  | typeof TAG.Activity
  | typeof TAG.Notifications
  | typeof TAG.Announcements
  | typeof TAG.Reports
  | typeof TAG.Registry
  | typeof TAG.Areas
  | typeof TAG.Staff
  | typeof TAG.Archive
  | typeof TAG.Signatures
  | { type: typeof TAG.Request; id: string };

/* -------------------------------------------------------------------------- */

export const villageApi = createApi({
  reducerPath: "villageApi",
  baseQuery,
  tagTypes: Object.values(TAG),
  keepUnusedDataFor: 120,
  refetchOnFocus: true,
  refetchOnReconnect: true,

  endpoints: (build) => ({
    /* ---------------------------------------------------------------- read */

    /**
     * Whole-dashboard payload. Used for the first paint and for the KPI row,
     * which must stay coherent with the table it sits above.
     */
    getWorkspace: build.query<WorkspaceResponse, Partial<QueueQuery> | void>({
      query: (args) => ({ url: "workspace", params: toQueueParams(args ?? {}) }),
      providesTags: (result): Tag[] => {
        const base: Tag[] = [
          TAG.Workspace,
          TAG.Queue,
          TAG.Activity,
          { type: TAG.Request, id: "LIST" },
        ];
        if (!result) return base;
        return [
          ...base,
          ...result.queue.rows.map((row) => ({ type: TAG.Request, id: row.id }) as Tag),
        ];
      },
    }),

    /** The worklist alone — powers filter, sort and page changes. */
    listRequests: build.query<RequestsResponse, QueueQuery>({
      query: (args) => ({ url: "requests", params: toQueueParams(args) }),
      providesTags: (result): Tag[] => {
        const base: Tag[] = [TAG.Queue, { type: TAG.Request, id: "LIST" }];
        if (!result) return base;
        return [...base, ...result.rows.map((row) => ({ type: TAG.Request, id: row.id }) as Tag)];
      },
    }),

    /** Full dossier for the slide-over. */
    getRequest: build.query<RequestDetail, string>({
      query: (id) => ({ url: `requests/${id}` }),
      providesTags: (_result, _error, id) => [{ type: TAG.Request, id }],
    }),

    search: build.query<SearchResponse, { q: string; limit?: number }>({
      query: ({ q, limit = 6 }) => ({ url: "search", params: { q, limit } }),
      // A keystroke-level cache would thrash; keep only the active query.
      keepUnusedDataFor: 30,
    }),

    listNotifications: build.query<NotificationsResponse, void>({
      query: () => ({ url: "notifications" }),
      providesTags: [TAG.Notifications],
    }),

    listAnnouncements: build.query<AnnouncementsResponse, void>({
      query: () => ({ url: "announcements" }),
      providesTags: [TAG.Announcements],
    }),

    /**
     * Chrome payload: identity, shift, bell, rail badges. Fetched once per
     * route by the persistent shell, never by the page bodies.
     */
    getShell: build.query<ShellResponse, void>({
      query: () => ({ url: "shell" }),
      providesTags: [TAG.Workspace, TAG.Notifications],
    }),

    /** Paged citizen reports with facets and the reporting-period summary. */
    listReports: build.query<ReportsResponse, Partial<ReportQuery> | void>({
      query: (args) => ({ url: "reports", params: toReportParams(args ?? {}) }),
      providesTags: [TAG.Reports],
    }),

    /** Population registry — residents or families, same page shape. */
    listRegistry: build.query<RegistryResponse, Partial<RegistryQuery>>({
      query: (args) => ({ url: "registry", params: toRegistryParams(args) }),
      providesTags: [TAG.Registry],
    }),

    listAreas: build.query<AreasResponse, void>({
      query: () => ({ url: "areas" }),
      providesTags: [TAG.Areas],
    }),

    listStaff: build.query<StaffResponse, void>({
      query: () => ({ url: "staff" }),
      providesTags: [TAG.Staff],
    }),

    listArchive: build.query<ArchiveResponse, Partial<QueueQuery>>({
      query: (args) => ({ url: "archive", params: toQueueParams(args) }),
      providesTags: [TAG.Archive],
    }),

    listSignatures: build.query<SignaturesResponse, void>({
      query: () => ({ url: "signatures" }),
      providesTags: [TAG.Signatures],
    }),

    /* --------------------------------------------------------------- write */

    /**
     * Verifikasi: setujui / minta perbaikan / tolak, with per-document verdicts.
     * Invalidates the queue *and* the activity feed, because the decision writes
     * an audit entry that the panel below must show immediately.
     */
    verifyRequest: build.mutation<VerifyResponse, { id: string; body: VerifyRequestInput }>({
      query: ({ id, body }) => ({ url: `requests/${id}/verify`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: TAG.Request, id },
        { type: TAG.Request, id: "LIST" },
        TAG.Queue,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
        TAG.Archive,
        TAG.Signatures,
      ],
    }),

    signRequest: build.mutation<SignResponse, { id: string; passphrase: string }>({
      query: ({ id, passphrase }) => ({
        url: `requests/${id}/sign`,
        method: "POST",
        body: { passphrase },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: TAG.Request, id },
        { type: TAG.Request, id: "LIST" },
        TAG.Queue,
        TAG.Workspace,
        TAG.Activity,
        TAG.Archive,
        TAG.Signatures,
      ],
    }),

    publishAnnouncement: build.mutation<PublishResponse, AnnouncementDraft>({
      query: (body) => ({ url: "announcements", method: "POST", body }),
      invalidatesTags: () => [TAG.Announcements, TAG.Workspace, TAG.Activity],
    }),

    markNotificationsRead: build.mutation<{ ok: true; updated: number }, { ids?: string[] } | void>({
      query: (body) => ({ url: "notifications", method: "POST", body: body ?? {} }),
      invalidatesTags: [TAG.Notifications, TAG.Workspace],
    }),
  }),
});

export const {
  useGetWorkspaceQuery,
  useGetShellQuery,
  useListReportsQuery,
  useListRegistryQuery,
  useListAreasQuery,
  useListStaffQuery,
  useListArchiveQuery,
  useListSignaturesQuery,
  useListRequestsQuery,
  useGetRequestQuery,
  useSearchQuery,
  useListNotificationsQuery,
  useListAnnouncementsQuery,
  useVerifyRequestMutation,
  useSignRequestMutation,
  usePublishAnnouncementMutation,
  useMarkNotificationsReadMutation,
} = villageApi;

export const villageApiReducerPath = villageApi.reducerPath;
export const villageApiMiddleware = villageApi.middleware;

/** URL for the PDF route — a plain link, since it must open in a new tab. */
export function letterPdfUrl(id: string, mode: "draft" | "final", copies = 1) {
  const params = new URLSearchParams({ mode, copies: String(copies) });
  return `/api/requests/${id}/pdf?${params.toString()}`;
}

export type { Tag };
