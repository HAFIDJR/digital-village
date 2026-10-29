import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
} from "@reduxjs/toolkit/query/react";

import type {
  AnnouncementDetail,
  AnnouncementEntry,
  ArchivePage,
  AreaOverview,
  FamilyDetail,
  FamilyReport,
  FamilyRow,
  LetterTypeEntry,
  NotificationDetail,
  NotificationEntry,
  QueuePage,
  RegistryPage,
  ReportAttachmentView,
  ReportPage,
  RequestDetail,
  ResidentAnnouncementEntry,
  ResidentLetterType,
  ResidentPortalRequest,
  ResidentReportEntry,
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
  AnnouncementUpdate,
  FamilyDraft,
  FamilyUpdate,
  HamletDraft,
  HamletUpdate,
  NeighborhoodDraft,
  NeighborhoodUpdate,
  QueueQuery,
  RegistryQuery,
  ReportAdvance,
  ReportDraft,
  ReportQuery,
  ReportUpdate,
  ResidentAccountDraft,
  ResidentAccountReset,
  ResidentAccountStatus,
  ResidentDraft,
  ResidentUpdate,
  VerifyRequestInput,
} from "@/lib/validators";

export type ApiError = {
  status: number | string;
  data?: {
    error?: {
      code: string;
      message: string;
      fields?: Record<string, string[]>;
    };
  };
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

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "same-origin",
  prepareHeaders: (headers) => {
    headers.set("Accept", "application/json");
    return headers;
  },
});

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

export type WorkspaceResponse = WorkspaceOverview;
export type RequestsResponse = QueuePage & { serverTime: string };
export type SearchResponse = SearchResults & { query: string };
export type NotificationsResponse = {
  notifications: NotificationEntry[];
  unread: number;
};
export type ShellResponse = ShellPayload;

export type ReportsResponse = ReportPage & {
  query: ReportQuery;
  serverTime: string;
};

export type RegistryResponse =
  | (RegistryPage<ResidentRow> & {
      type: "residents";
      query: RegistryQuery;
      serverTime: string;
    })
  | (RegistryPage<FamilyRow> & {
      type: "families";
      query: RegistryQuery;
      serverTime: string;
    });

export type AreasResponse = AreaOverview & { serverTime: string };
export type StaffResponse = {
  village: VillageProfile;
  staff: StaffMember[];
  letterTypes: LetterTypeEntry[];
  serverTime: string;
};

export type ArchiveResponse = ArchivePage & {
  query: QueueQuery;
  serverTime: string;
};

export type SignaturesResponse = {
  entries: SignatureQueueEntry[];
  serverTime: string;
};
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

export type PrintResponse = string;

export type LoginResponse = {
  ok: true;
  officer: { id: string; fullName: string; jobTitle: string; role: string };
  redirectTo: string;
};

export type WargaLoginResponse = {
  ok: true;
  resident: { fullName: string };
  redirectTo: string;
};

export type LogoutResponse = { ok: true; redirectTo: string };

export type EsignActivationResponse = {
  ok: true;
  activated: boolean;
  rotated: boolean;
};

export type ResidentRequestsResponse = {
  requests: ResidentPortalRequest[];
  serverTime: string;
};

export type ResidentReportsResponse = {
  reports: ResidentReportEntry[];
  serverTime: string;
};

export type ResidentAnnouncementsResponse = {
  announcements: ResidentAnnouncementEntry[];
  unread: number;
  serverTime: string;
};

export type ResidentLetterTypesResponse = {
  letterTypes: ResidentLetterType[];
  serverTime: string;
};

export type CreateReportResponse = {
  ok: true;
  report: {
    id: string;
    ticket: string;
    category: string;
    subject: string;
    status: string;
    priority: string;
    attachmentCount: number;
    submittedAt: string;
  };
};

export type AdvanceReportResponse = {
  ok: true;
  ticket: string;
  status: string;
  resolvedAt: string | null;
  rejectionReason: string | null;
  responseCount: number;
};

export type DeleteResidentResponse = {
  ok: true;
  resident: { id: string; nik: string; fullName: string };
};

export type ResidentAccountActionResponse = {
  ok: true;
  account: {
    id: string;
    residentId: string;
    nik: string;
    active: boolean;
    sessionsRevoked: number;
  };
};

export type FamilyDetailResponse = { ok: true; family: FamilyDetail };

export type UpdateFamilyResponse = {
  ok: true;
  family: {
    id: string;
    kkNumber: string;
    headName: string;
    memberCount: number;
    neighborhoodId: string;
  };
};

export type DeleteFamilyResponse = {
  ok: true;
  family: {
    id: string;
    kkNumber: string;
    headName: string;
    releasedMemberIds: string[];
  };
};

export type HamletResponse = {
  ok: true;
  hamlet: {
    id: string;
    name: string;
    code: string;
    headName: string | null;
  };
};

export type DeleteHamletResponse = {
  ok: true;
  hamlet: { id: string; code: string; name: string };
};

export type NeighborhoodResponse = {
  ok: true;
  neighborhood: {
    id: string;
    hamletId: string;
    rt: number;
    rw: number;
    headName: string | null;
  };
};

export type DeleteNeighborhoodResponse = {
  ok: true;
  neighborhood: { id: string; rt: number; rw: number; hamletId: string };
};

export type AnnouncementDetailResponse = {
  ok: true;
  announcement: AnnouncementDetail;
};

export type UpdateAnnouncementResponse = {
  ok: true;
  announcement: {
    id: string;
    title: string;
    slug: string;
    status: string;
    channel: string;
    priority: string;
    pinned: boolean;
    publishAt: string | null;
    expiresAt: string | null;
  };
};

export type DeleteAnnouncementResponse = {
  ok: true;
  announcement: {
    id: string;
    title: string;
    status: string;
    wasPublished: boolean;
  };
};

export type NotificationDetailResponse = {
  ok: true;
  notification: NotificationDetail;
};

export type ReportAttachmentsResponse = {
  ok: true;
  attachments: ReportAttachmentView[];
};

export type AddReportAttachmentsResponse = {
  ok: true;
  reportId: string;
  ticket: string;
  attachmentCount: number;
  attachments: ReportAttachmentView[];
};

export type RemoveReportAttachmentResponse = {
  ok: true;
  reportId: string;
  attachmentCount: number;
};

export type ResidentReportResponse = {
  ok: true;
  report: ResidentReportEntry;
  attachments: ReportAttachmentView[];
};

export type UpdateResidentReportResponse = {
  ok: true;
  report: {
    id: string;
    ticket: string;
    category: string;
    subject: string;
    body: string;
    status: string;
    priority: string;
    neighborhoodId: string | null;
  };
};

export type DeleteResidentReportResponse = {
  ok: true;
  report: { id: string; ticket: string; subject: string };
};

export type CreateRequestResponse = {
  ok: true;
  request: {
    id: string;
    ticket: string;
    status: string;
    channel: string;
    documentsUploaded: number;
    documentsRequired: number;
    submittedAt: string;
    dueAt: string | null;
  };
};

export type ResidentSummary = {
  id: string;
  nik: string;
  fullName: string;
  familyId: string | null;
  neighborhoodId: string;
  status: string;
  documentsVerified: boolean;
};

export type CreateResidentResponse = {
  ok: true;
  resident: ResidentSummary & { gender: string; birthDate: string };
};

export type UpdateResidentResponse = { ok: true; resident: ResidentSummary };

export type CreateFamilyResponse = {
  ok: true;
  family: {
    id: string;
    kkNumber: string;
    headName: string;
    neighborhoodId: string;
    welfareClass: string | null;
    memberCount: number;
  };
};

export type CreateResidentAccountResponse = {
  ok: true;
  account: {
    id: string;
    residentId: string;
    nik: string;
    active: boolean;
    createdAt: string;
  };
};

export type RegistryReportResponse = FamilyReport & { serverTime: string };

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
  ResidentRequests: "ResidentRequests",
  ResidentReports: "ResidentReports",
  ResidentAnnouncements: "ResidentAnnouncements",
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
  | typeof TAG.ResidentRequests
  | typeof TAG.ResidentReports
  | typeof TAG.ResidentAnnouncements
  | { type: typeof TAG.Request; id: string };

export const villageApi = createApi({
  reducerPath: "villageApi",
  baseQuery,
  tagTypes: Object.values(TAG),
  keepUnusedDataFor: 120,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getWorkspace: build.query<WorkspaceResponse, Partial<QueueQuery> | void>({
      query: (args) => ({
        url: "workspace",
        params: toQueueParams(args ?? {}),
      }),
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
          ...result.queue.rows.map(
            (row) => ({ type: TAG.Request, id: row.id }) as Tag,
          ),
        ];
      },
    }),
    listRequests: build.query<RequestsResponse, QueueQuery>({
      query: (args) => ({ url: "requests", params: toQueueParams(args) }),
      providesTags: (result): Tag[] => {
        const base: Tag[] = [TAG.Queue, { type: TAG.Request, id: "LIST" }];
        if (!result) return base;
        return [
          ...base,
          ...result.rows.map(
            (row) => ({ type: TAG.Request, id: row.id }) as Tag,
          ),
        ];
      },
    }),
    getRequest: build.query<RequestDetail, string>({
      query: (id) => ({ url: `requests/${id}` }),
      providesTags: (_result, _error, id) => [{ type: TAG.Request, id }],
    }),
    search: build.query<SearchResponse, { q: string; limit?: number }>({
      query: ({ q, limit = 6 }) => ({ url: "search", params: { q, limit } }),
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
    getShell: build.query<ShellResponse, void>({
      query: () => ({ url: "shell" }),
      providesTags: [TAG.Workspace, TAG.Notifications],
    }),
    listReports: build.query<ReportsResponse, Partial<ReportQuery> | void>({
      query: (args) => ({ url: "reports", params: toReportParams(args ?? {}) }),
      providesTags: [TAG.Reports],
    }),
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
    listResidentRequests: build.query<ResidentRequestsResponse, void>({
      query: () => ({ url: "warga/requests" }),
      providesTags: [TAG.ResidentRequests],
    }),
    listResidentReports: build.query<ResidentReportsResponse, void>({
      query: () => ({ url: "warga/reports" }),
      providesTags: [TAG.ResidentReports],
    }),
    listResidentAnnouncements: build.query<
      ResidentAnnouncementsResponse,
      { since?: string } | void
    >({
      query: (args) => ({
        url: "warga/announcements",
        params: args?.since ? { since: args.since } : undefined,
      }),
      providesTags: [TAG.ResidentAnnouncements],
    }),
    listResidentLetterTypes: build.query<ResidentLetterTypesResponse, void>({
      query: () => ({ url: "warga/letter-types" }),
      keepUnusedDataFor: 300,
    }),
    getRegistryReport: build.query<RegistryReportResponse, void>({
      query: () => ({ url: "registry/report" }),
      providesTags: [TAG.Registry],
    }),
    getFamilyDetail: build.query<FamilyDetailResponse, string>({
      query: (id) => ({ url: `registry/families/${id}` }),
      providesTags: [TAG.Registry],
    }),
    getAnnouncement: build.query<AnnouncementDetailResponse, string>({
      query: (id) => ({ url: `announcements/${id}` }),
      providesTags: [TAG.Announcements],
    }),
    getNotificationDetail: build.query<NotificationDetailResponse, string>({
      query: (id) => ({ url: `notifications/${id}` }),
      providesTags: [TAG.Notifications],
    }),
    listReportAttachments: build.query<ReportAttachmentsResponse, string>({
      query: (reportId) => ({ url: `reports/${reportId}/attachments` }),
      providesTags: [TAG.Reports],
    }),
    getResidentReport: build.query<ResidentReportResponse, string>({
      query: (id) => ({ url: `warga/reports/${id}` }),
      providesTags: [TAG.ResidentReports],
    }),
    createReport: build.mutation<CreateReportResponse, ReportDraft>({
      query: (body) => ({ url: "reports", method: "POST", body }),
      invalidatesTags: () => [
        TAG.ResidentReports,
        TAG.Reports,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    /** Portal filing with photos: the component builds the FormData itself. */
    createReportWithFiles: build.mutation<CreateReportResponse, FormData>({
      query: (body) => ({ url: "reports", method: "POST", body }),
      invalidatesTags: () => [
        TAG.ResidentReports,
        TAG.Reports,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    advanceReport: build.mutation<
      AdvanceReportResponse,
      { id: string; body: ReportAdvance }
    >({
      query: ({ id, body }) => ({
        url: `reports/${id}/status`,
        method: "POST",
        body,
      }),
      invalidatesTags: () => [
        TAG.Reports,
        TAG.ResidentReports,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    /** Staff adds photos to a report (loket follow-up); multipart FormData. */
    addReportAttachments: build.mutation<
      AddReportAttachmentsResponse,
      { reportId: string; body: FormData }
    >({
      query: ({ reportId, body }) => ({
        url: `reports/${reportId}/attachments`,
        method: "POST",
        body,
      }),
      invalidatesTags: () => [
        TAG.Reports,
        TAG.ResidentReports,
        TAG.Activity,
      ],
    }),
    removeReportAttachment: build.mutation<
      RemoveReportAttachmentResponse,
      { reportId: string; attachmentId: string }
    >({
      query: ({ reportId, attachmentId }) => ({
        url: `reports/${reportId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: () => [
        TAG.Reports,
        TAG.ResidentReports,
        TAG.Activity,
      ],
    }),

    updateResidentReport: build.mutation<
      UpdateResidentReportResponse,
      { id: string; body: ReportUpdate }
    >({
      query: ({ id, body }) => ({
        url: `warga/reports/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [
        TAG.ResidentReports,
        TAG.Reports,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    deleteResidentReport: build.mutation<DeleteResidentReportResponse, string>({
      query: (id) => ({ url: `warga/reports/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.ResidentReports,
        TAG.Reports,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    addResidentReportAttachments: build.mutation<
      AddReportAttachmentsResponse,
      { reportId: string; body: FormData }
    >({
      query: ({ reportId, body }) => ({
        url: `warga/reports/${reportId}/attachments`,
        method: "POST",
        body,
      }),
      invalidatesTags: () => [TAG.ResidentReports],
    }),
    removeResidentReportAttachment: build.mutation<
      RemoveReportAttachmentResponse,
      { reportId: string; attachmentId: string }
    >({
      query: ({ reportId, attachmentId }) => ({
        url: `warga/reports/${reportId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: () => [TAG.ResidentReports],
    }),

    createRequest: build.mutation<CreateRequestResponse, FormData>({
      query: (body) => ({ url: "requests", method: "POST", body }),
      invalidatesTags: () => [
        TAG.ResidentRequests,
        TAG.Queue,
        { type: TAG.Request, id: "LIST" },
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    markResidentAnnouncementsRead: build.mutation<
      { ok: true; updated: number },
      { ids?: string[] } | void
    >({
      query: (body) => ({
        url: "warga/announcements",
        method: "POST",
        body: body ?? {},
      }),
      invalidatesTags: [TAG.ResidentAnnouncements],
    }),

    // Registrasi kependudukan (capability: manageRegistry)
    createResident: build.mutation<CreateResidentResponse, ResidentDraft>({
      query: (body) => ({ url: "registry/residents", method: "POST", body }),
      invalidatesTags: () => [TAG.Registry, TAG.Areas, TAG.Workspace, TAG.Activity],
    }),
    updateResident: build.mutation<
      UpdateResidentResponse,
      { id: string; body: ResidentUpdate }
    >({
      query: ({ id, body }) => ({
        url: `registry/residents/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        TAG.Registry,
        TAG.Areas,
        TAG.Workspace,
        TAG.Activity,
        { type: TAG.Request, id },
      ],
    }),
    createFamily: build.mutation<CreateFamilyResponse, FamilyDraft>({
      query: (body) => ({ url: "registry/families", method: "POST", body }),
      invalidatesTags: () => [TAG.Registry, TAG.Areas, TAG.Workspace, TAG.Activity],
    }),
    createResidentAccount: build.mutation<
      CreateResidentAccountResponse,
      ResidentAccountDraft
    >({
      query: (body) => ({ url: "registry/accounts", method: "POST", body }),
      invalidatesTags: () => [TAG.Registry, TAG.Workspace, TAG.Activity],
    }),
    deleteResident: build.mutation<DeleteResidentResponse, string>({
      query: (id) => ({ url: `registry/residents/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.Registry,
        TAG.Areas,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    resetResidentAccountPassword: build.mutation<
      ResidentAccountActionResponse,
      ResidentAccountReset
    >({
      query: (body) => ({
        url: `registry/accounts/${body.residentId}/password`,
        method: "POST",
        body,
      }),
      invalidatesTags: () => [TAG.Registry, TAG.Workspace, TAG.Activity],
    }),
    setResidentAccountActive: build.mutation<
      ResidentAccountActionResponse,
      ResidentAccountStatus
    >({
      query: (body) => ({
        url: `registry/accounts/${body.residentId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [TAG.Registry, TAG.Workspace, TAG.Activity],
    }),
    updateFamily: build.mutation<
      UpdateFamilyResponse,
      { id: string; body: FamilyUpdate }
    >({
      query: ({ id, body }) => ({
        url: `registry/families/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [
        TAG.Registry,
        TAG.Areas,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    deleteFamily: build.mutation<DeleteFamilyResponse, string>({
      query: (id) => ({ url: `registry/families/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.Registry,
        TAG.Areas,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),

    // Wilayah administratif (capability: manageArea)
    createHamlet: build.mutation<HamletResponse, HamletDraft>({
      query: (body) => ({ url: "registry/hamlets", method: "POST", body }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    updateHamlet: build.mutation<
      HamletResponse,
      { id: string; body: HamletUpdate }
    >({
      query: ({ id, body }) => ({
        url: `registry/hamlets/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    deleteHamlet: build.mutation<DeleteHamletResponse, string>({
      query: (id) => ({ url: `registry/hamlets/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    createNeighborhood: build.mutation<NeighborhoodResponse, NeighborhoodDraft>({
      query: (body) => ({ url: "registry/neighborhoods", method: "POST", body }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
      ],
    }),
    updateNeighborhood: build.mutation<
      NeighborhoodResponse,
      { id: string; body: NeighborhoodUpdate }
    >({
      query: ({ id, body }) => ({
        url: `registry/neighborhoods/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),
    deleteNeighborhood: build.mutation<DeleteNeighborhoodResponse, string>({
      query: (id) => ({ url: `registry/neighborhoods/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.Areas,
        TAG.Registry,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),

    verifyRequest: build.mutation<
      VerifyResponse,
      { id: string; body: VerifyRequestInput }
    >({
      query: ({ id, body }) => ({
        url: `requests/${id}/verify`,
        method: "POST",
        body,
      }),
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
    signRequest: build.mutation<
      SignResponse,
      { id: string; passphrase: string }
    >({
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
    updateAnnouncement: build.mutation<
      UpdateAnnouncementResponse,
      { id: string; body: AnnouncementUpdate }
    >({
      query: ({ id, body }) => ({
        url: `announcements/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: () => [TAG.Announcements, TAG.Workspace, TAG.Activity],
    }),
    deleteAnnouncement: build.mutation<DeleteAnnouncementResponse, string>({
      query: (id) => ({ url: `announcements/${id}`, method: "DELETE" }),
      invalidatesTags: () => [
        TAG.Announcements,
        TAG.Workspace,
        TAG.Activity,
        TAG.Notifications,
      ],
    }),

    markNotificationsRead: build.mutation<
      { ok: true; updated: number },
      { ids?: string[] } | void
    >({
      query: (body) => ({
        url: "notifications",
        method: "POST",
        body: body ?? {},
      }),
      invalidatesTags: [TAG.Notifications, TAG.Workspace],
    }),
    markNotificationRead: build.mutation<{ ok: true; id: string }, string>({
      query: (id) => ({ url: `notifications/${id}`, method: "PATCH" }),
      invalidatesTags: [TAG.Notifications, TAG.Workspace],
    }),
    // Auth
    login: build.mutation<
      LoginResponse,
      {
        email: string;
        password: string;
        station?: string;
        next?: string;
      }
    >({
      query: (body) => ({ url: "auth/login", method: "POST", body }),
    }),

    wargaLogin: build.mutation<
      WargaLoginResponse,
      { nik: string; password: string; next?: string }
    >({
      query: (body) => ({ url: "auth/warga/login", method: "POST", body }),
    }),

    logout: build.mutation<LogoutResponse, void>({
      query: () => ({ url: "auth/logout", method: "POST", body: {} }),
      invalidatesTags: [
        TAG.Workspace,
        TAG.Notifications,
        TAG.Queue,
        TAG.Activity,
      ],
    }),
    activateEsignPassphrase: build.mutation<
      EsignActivationResponse,
      { currentPassphrase?: string; newPassphrase: string }
    >({
      query: (body) => ({ url: "auth/esign-passphrase", method: "POST", body }),
      invalidatesTags: [TAG.Workspace, TAG.Staff],
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
  useListResidentRequestsQuery,
  useListResidentReportsQuery,
  useListResidentAnnouncementsQuery,
  useListResidentLetterTypesQuery,
  useGetRegistryReportQuery,
  useGetFamilyDetailQuery,
  useGetAnnouncementQuery,
  useGetNotificationDetailQuery,
  useListReportAttachmentsQuery,
  useGetResidentReportQuery,
  useCreateReportMutation,
  useCreateReportWithFilesMutation,
  useAdvanceReportMutation,
  useAddReportAttachmentsMutation,
  useRemoveReportAttachmentMutation,
  useUpdateResidentReportMutation,
  useDeleteResidentReportMutation,
  useAddResidentReportAttachmentsMutation,
  useRemoveResidentReportAttachmentMutation,
  useCreateRequestMutation,
  useMarkResidentAnnouncementsReadMutation,
  useCreateResidentMutation,
  useUpdateResidentMutation,
  useDeleteResidentMutation,
  useCreateFamilyMutation,
  useUpdateFamilyMutation,
  useDeleteFamilyMutation,
  useCreateResidentAccountMutation,
  useResetResidentAccountPasswordMutation,
  useSetResidentAccountActiveMutation,
  useCreateHamletMutation,
  useUpdateHamletMutation,
  useDeleteHamletMutation,
  useCreateNeighborhoodMutation,
  useUpdateNeighborhoodMutation,
  useDeleteNeighborhoodMutation,
  useVerifyRequestMutation,
  useSignRequestMutation,
  usePublishAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useMarkNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useLoginMutation,
  useWargaLoginMutation,
  useLogoutMutation,
  useActivateEsignPassphraseMutation,
} = villageApi;

export const villageApiReducerPath = villageApi.reducerPath;
export const villageApiMiddleware = villageApi.middleware;
export function letterPdfUrl(id: string, mode: "draft" | "final", copies = 1) {
  const params = new URLSearchParams({ mode, copies: String(copies) });
  return `/api/requests/${id}/pdf?${params.toString()}`;
}
export function attachmentFileUrl(requestId: string, attachmentId: string) {
  return `/api/requests/${requestId}/attachments/${attachmentId}`;
}
/** Staff-side inline photo URL for the report drawer. */
export function reportAttachmentFileUrl(reportId: string, attachmentId: string) {
  return `/api/reports/${reportId}/attachments/${attachmentId}`;
}
/** Resident-side inline photo URL for the portal report views. */
export function residentReportAttachmentFileUrl(
  reportId: string,
  attachmentId: string,
) {
  return `/api/warga/reports/${reportId}/attachments/${attachmentId}`;
}

export type { Tag };