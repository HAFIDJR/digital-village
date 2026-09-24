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

import type { QueueQuery } from "@/lib/validators";
import type {
  AnnouncementEntry,
  NotificationEntry,
  RequestDetail,
  SearchResults,
  WorkspaceOverview,
} from "@/db/queries";
import type { QueuePage } from "@/db/queries";
import type { AnnouncementDraft, VerifyRequestInput } from "@/lib/validators";

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
} as const;

type Tag =
  | typeof TAG.Workspace
  | typeof TAG.Queue
  | typeof TAG.Activity
  | typeof TAG.Notifications
  | typeof TAG.Announcements
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
