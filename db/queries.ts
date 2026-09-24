/**
 * Read layer.
 *
 * Every function here is a *server* function. Route handlers are the only
 * callers — the browser never talks to Postgres, and no query is composed from
 * raw client input (all filters arrive already narrowed by `lib/validators`).
 *
 * Aggregates are computed in SQL rather than in JavaScript so the KPI row stays
 * a fixed number of round trips regardless of population size.
 */
import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { getDb } from "./client";
import type { QueueQuery, RegistryQuery, ReportQuery } from "@/lib/validators";

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export type VillageProfile = {
  id: string;
  name: string;
  district: string;
  regency: string;
  province: string;
  villageCode: string;
  headName: string;
  headNipd: string | null;
  officeAddress: string;
  officePhone: string;
  officeEmail: string;
  website: string | null;
  sealUrl: string | null;
  establishedYear: number | null;
};

export type ActiveOfficer = {
  id: string;
  fullName: string;
  jobTitle: string;
  role: string;
  initials: string;
  nipd: string | null;
  email: string;
  canSign: boolean;
  shiftStartedAt: string | null;
  shiftStation: string | null;
};

export type KpiSummary = {
  lettersToday: number;
  lettersTodayUnprocessed: number;
  lettersTodayProcessed: number;
  lettersTodayDelta: number;
  activeResidents: number;
  activeFamilies: number;
  residentsDelta30d: number;
  males: number;
  females: number;
  reportsNew: number;
  reportsInProgress: number;
  reportsResolvedThisMonth: number;
  signaturesPending: number;
  signaturesSignedToday: number;
  signerOnline: boolean;
  signerName: string;
  signerLastSeenAt: string | null;
  overdueCount: number;
  avgTurnaroundHours: number | null;
};

export type QueueRow = {
  id: string;
  ticket: string;
  applicantName: string;
  applicantNik: string;
  applicantPhone: string | null;
  letterCode: string;
  letterName: string;
  status: string;
  priority: string;
  channel: string;
  dusun: string;
  dusunCode: string;
  rt: number;
  rw: number;
  documentsUploaded: number;
  documentsRequired: number;
  complianceNote: string | null;
  submittedAt: string;
  dueAt: string | null;
  ageMinutes: number;
  slaMinutes: number | null;
  assignedTo: string | null;
  assignedInitials: string | null;
};

export type QueuePage = {
  rows: QueueRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Counts per status across the *unfiltered* worklist, for the filter rail. */
  statusCounts: Record<string, number>;
  /**
   * Counts per dusun across the unfiltered worklist.
   *
   * `code` is what the filter accepts; `name` is what the officer reads. The two
   * are kept distinct so the filter never has to parse a display label.
   */
  dusunCounts: { code: string; name: string; count: number }[];
  /** Counts per letter type across the unfiltered worklist. */
  letterTypeCounts: { code: string; name: string; count: number }[];
  /** Count of rows past SLA under the current filters. */
  overdueTotal: number;
};

export type AttachmentView = {
  id: string;
  docKey: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  defectNote: string | null;
  uploadedAt: string;
  verifiedByName: string | null;
};

export type RequestDetail = {
  id: string;
  ticket: string;
  status: string;
  priority: string;
  channel: string;
  purpose: string;
  payload: Record<string, string | number | null>;
  agendaNumber: number | null;
  verificationCode: string;
  complianceNote: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  dueAt: string | null;
  verifiedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  documentsUploaded: number;
  documentsRequired: number;
  letter: {
    id: string;
    code: string;
    name: string;
    templateTitle: string;
    slaDays: number;
    feeIdr: number;
    requiresKadesSignature: boolean;
  };
  applicant: {
    id: string | null;
    residentId: string | null;
    fullName: string;
    nik: string;
    phone: string | null;
    gender: string | null;
    birthPlace: string | null;
    birthDate: string | null;
    religion: string | null;
    maritalStatus: string | null;
    occupation: string | null;
    education: string | null;
    nationality: string | null;
    familyRelation: string | null;
    address: string;
    status: string | null;
  };
  family: { id: string | null; kkNumber: string | null; headName: string | null; memberCount: number | null };
  location: { dusun: string; dusunCode: string; rt: number; rw: number; headName: string | null };
  attachments: AttachmentView[];
  missingRequirements: { docKey: string; label: string; mandatory: boolean }[];
  signature: {
    id: string;
    status: string;
    certificateSerial: string | null;
    requestedAt: string;
    signedAt: string | null;
    expiresAt: string | null;
    requestedByName: string | null;
    signerName: string | null;
    note: string | null;
  } | null;
  officer: { id: string; fullName: string; jobTitle: string; initials: string } | null;
  timeline: {
    id: string;
    kind: string;
    summary: string;
    actorName: string;
    actorInitials: string;
    actorRole: string;
    occurredAt: string;
  }[];
};

export type ActivityEntry = {
  id: string;
  kind: string;
  summary: string;
  subjectRef: string | null;
  subjectType: string | null;
  subjectId: string | null;
  actorName: string;
  actorInitials: string;
  actorRole: string;
  meta: Record<string, unknown>;
  occurredAt: string;
};

export type NotificationEntry = {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ReportEntry = {
  id: string;
  ticket: string;
  reporterName: string;
  subject: string;
  category: string;
  body: string;
  status: string;
  priority: string;
  dusun: string | null;
  rt: number | null;
  rw: number | null;
  handledByName: string | null;
  responseCount: number;
  submittedAt: string;
  resolvedAt: string | null;
};

export type AnnouncementEntry = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  channel: string;
  status: string;
  priority: string;
  pinned: boolean;
  audience: string;
  authorName: string | null;
  publishAt: string | null;
  viewCount: number;
  createdAt: string;
};

export type SearchResults = {
  residents: {
    id: string;
    fullName: string;
    nik: string;
    kkNumber: string | null;
    dusun: string;
    rt: number;
    rw: number;
    status: string;
    age: number;
  }[];
  requests: {
    id: string;
    ticket: string;
    applicantName: string;
    letterCode: string;
    status: string;
    submittedAt: string;
  }[];
  reports: { id: string; ticket: string; subject: string; status: string }[];
  totalMatches: number;
};

export type ServiceTrendPoint = {
  statDate: string;
  received: number;
  completed: number;
  rejected: number;
};

export type WorkspaceOverview = {
  village: VillageProfile;
  officer: ActiveOfficer | null;
  kpi: KpiSummary;
  queue: QueuePage;
  activity: ActivityEntry[];
  notifications: NotificationEntry[];
  reports: ReportEntry[];
  announcements: AnnouncementEntry[];
  trend: ServiceTrendPoint[];
  letterTypes: { code: string; name: string; count: number }[];
  dusunOptions: { code: string; name: string; count: number }[];
  serverTime: string;
};

/* -------------------------------------------------------------------------- */
/* Village & officer                                                           */
/* -------------------------------------------------------------------------- */

export async function getVillageProfile(): Promise<VillageProfile | null> {
  const db = await getDb();
  const result = await db.execute<VillageProfile>(sql`
    select id,
           name,
           district,
           regency,
           province,
           village_code      as "villageCode",
           head_name         as "headName",
           head_nipd         as "headNipd",
           office_address    as "officeAddress",
           office_phone      as "officePhone",
           office_email      as "officeEmail",
           website,
           seal_url          as "sealUrl",
           established_year  as "establishedYear"
    from villages
    order by created_at
    limit 1
  `);
  return result.rows[0] ?? null;
}

/**
 * The officer the dashboard acts as.
 *
 * A real deployment resolves this from the session. Here it is the officer on
 * the currently open shift — which also makes the "shift aktif" indicator in
 * the topbar a true reflection of the `staff_shifts` table rather than a prop.
 */
export async function getActiveOfficer(villageId: string): Promise<ActiveOfficer | null> {
  const db = await getDb();
  const result = await db.execute<ActiveOfficer>(sql`
    select s.id,
           s.full_name       as "fullName",
           s.job_title       as "jobTitle",
           s.role::text      as "role",
           s.initials,
           s.nipd,
           s.email,
           s.can_sign        as "canSign",
           sh.started_at     as "shiftStartedAt",
           sh.station        as "shiftStation"
    from staff s
    left join staff_shifts sh
      on sh.staff_id = s.id and sh.ended_at is null
    where s.village_id = ${villageId}
      and s.active = true
    order by (sh.started_at is null), s.created_at
    limit 1
  `);
  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* KPI summary                                                                 */
/* -------------------------------------------------------------------------- */

export async function getKpiSummary(villageId: string): Promise<KpiSummary> {
  const db = await getDb();
  const result = await db.execute<{
    lettersToday: number;
    lettersTodayUnprocessed: number;
    lettersTodayProcessed: number;
    lettersYesterday: number;
    activeResidents: number;
    activeFamilies: number;
    residents30dAgo: number;
    males: number;
    females: number;
    reportsNew: number;
    reportsInProgress: number;
    reportsResolvedThisMonth: number;
    signaturesPending: number;
    signaturesSignedToday: number;
    overdueCount: number;
    avgTurnaroundHours: number | null;
  }>(sql`
    with today as (select date_trunc('day', now()) as d),
         yesterday as (select date_trunc('day', now()) - interval '1 day' as d)
    select
      (select count(*)::int from letter_requests
        where village_id = ${villageId} and submitted_at >= (select d from today)) as "lettersToday",
      (select count(*)::int from letter_requests
        where village_id = ${villageId} and submitted_at >= (select d from today)
          and status in ('PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP')) as "lettersTodayUnprocessed",
      (select count(*)::int from letter_requests
        where village_id = ${villageId} and submitted_at >= (select d from today)
          and status not in ('PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP')) as "lettersTodayProcessed",
      (select count(*)::int from letter_requests
        where village_id = ${villageId}
          and submitted_at >= (select d from yesterday)
          and submitted_at < (select d from today)) as "lettersYesterday",
      (select count(*)::int from residents
        where village_id = ${villageId} and status = 'AKTIF') as "activeResidents",
      (select count(*)::int from families where village_id = ${villageId}) as "activeFamilies",
      (select active_residents from daily_stats
        where village_id = ${villageId}
        order by stat_date asc limit 1) as "residents30dAgo",
      (select count(*)::int from residents
        where village_id = ${villageId} and status = 'AKTIF' and gender = 'L') as "males",
      (select count(*)::int from residents
        where village_id = ${villageId} and status = 'AKTIF' and gender = 'P') as "females",
      (select count(*)::int from citizen_reports
        where village_id = ${villageId} and status = 'NEW') as "reportsNew",
      (select count(*)::int from citizen_reports
        where village_id = ${villageId} and status = 'IN_PROGRESS') as "reportsInProgress",
      (select count(*)::int from citizen_reports
        where village_id = ${villageId} and status = 'RESOLVED'
          and resolved_at >= date_trunc('month', now())) as "reportsResolvedThisMonth",
      (select count(*)::int from signature_requests sr
        join letter_requests lr on lr.id = sr.request_id
        where lr.village_id = ${villageId} and sr.status = 'MENUNGGU') as "signaturesPending",
      (select count(*)::int from signature_requests sr
        join letter_requests lr on lr.id = sr.request_id
        where lr.village_id = ${villageId} and sr.status = 'DITANDATANGANI'
          and sr.signed_at >= (select d from today)) as "signaturesSignedToday",
      (select count(*)::int from letter_requests
        where village_id = ${villageId} and due_at < now()
          and status in ('PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP','DIVERIFIKASI','MENUNGGU_TTD_KADES')) as "overdueCount",
      (select round(avg(extract(epoch from (completed_at - submitted_at)) / 3600)::numeric, 1)
        from letter_requests
        where village_id = ${villageId} and completed_at is not null
          and completed_at >= now() - interval '30 days') as "avgTurnaroundHours"
  `);

  const row = result.rows[0];

  // The signer is the officer who can authorise documents (Kepala Desa).
  const signer = await db.execute<{
    id: string;
    fullName: string;
    lastSeenAt: string | null;
    pending: number;
  }>(sql`
    select s.id,
           s.full_name as "fullName",
           s.last_seen_at as "lastSeenAt"
    from staff s
    where s.village_id = ${villageId} and s.can_sign = true and s.active = true
    order by s.created_at
    limit 1
  `);

  const signerRow = signer.rows[0];
  /**
   * "Online" means the signer's device touched the system recently, not that a
   * websocket is open — an officer stepping away from the desk for a meeting is
   * still reachable for a signature within the half hour. Below that the card
   * reports the signer as unreachable so nobody promises a citizen a signature
   * that cannot be produced before closing time.
   */
  const onlineThreshold = Date.now() - 30 * 60_000;
  const signerOnline = Boolean(
    signerRow?.lastSeenAt && new Date(signerRow.lastSeenAt).getTime() >= onlineThreshold,
  );

  const delta =
    row.residents30dAgo && row.residents30dAgo > 0
      ? row.activeResidents - row.residents30dAgo
      : 0;

  return {
    lettersToday: row.lettersToday,
    lettersTodayUnprocessed: row.lettersTodayUnprocessed,
    lettersTodayProcessed: row.lettersTodayProcessed,
    lettersTodayDelta: row.lettersToday - row.lettersYesterday,
    activeResidents: row.activeResidents,
    activeFamilies: row.activeFamilies,
    residentsDelta30d: delta,
    males: row.males,
    females: row.females,
    reportsNew: row.reportsNew,
    reportsInProgress: row.reportsInProgress,
    reportsResolvedThisMonth: row.reportsResolvedThisMonth,
    signaturesPending: row.signaturesPending,
    signaturesSignedToday: row.signaturesSignedToday,
    signerOnline,
    signerName: signerRow?.fullName ?? "Kepala Desa",
    signerLastSeenAt: signerRow?.lastSeenAt ?? null,
    overdueCount: row.overdueCount,
    avgTurnaroundHours: row.avgTurnaroundHours === null ? null : Number(row.avgTurnaroundHours),
  };
}

/* -------------------------------------------------------------------------- */
/* Letter request queue                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Binds a JS array as an explicit `in (…)` parameter list.
 *
 * Passing the array straight to the template (`= any(${array})`) does not work:
 * Drizzle flattens it into a parenthesised list of separate parameters, which
 * PostgreSQL rejects for `any()`. Building the list explicitly keeps every value
 * a bound parameter — no interpolation of user input into SQL text.
 */
function inList(column: SQL, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}

/** Builds the WHERE clause shared by the page query, the count and the facets. */
function buildQueueFilter(villageId: string, query: QueueQuery): SQL {
  const conditions: SQL[] = [sql`lr.village_id = ${villageId}`];

  if (query.q) {
    const pattern = `%${query.q}%`;
    const digits = query.q.replace(/\D/g, "");
    conditions.push(sql`(
      lr.applicant_name ilike ${pattern}
      or lr.ticket ilike ${pattern}
      ${digits.length >= 4 ? sql`or lr.applicant_nik like ${`${digits}%`}` : sql``}
    )`);
  }

  if (query.status?.length) {
    conditions.push(inList(sql`lr.status::text`, query.status));
  }
  if (query.letterType?.length) {
    conditions.push(inList(sql`lt.code`, query.letterType));
  }
  if (query.dusun?.length) {
    conditions.push(inList(sql`h.code`, query.dusun));
  }
  if (query.channel?.length) {
    conditions.push(inList(sql`lr.channel`, query.channel));
  }
  if (query.sla === "overdue") {
    conditions.push(sql`lr.due_at < now() and lr.status::text in (
      'PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP','DIVERIFIKASI','MENUNGGU_TTD_KADES'
    )`);
  } else if (query.sla === "today") {
    conditions.push(sql`lr.due_at < date_trunc('day', now()) + interval '1 day'`);
  }

  return sql.join(conditions, sql` and `);
}

function queueOrder(sort: QueueQuery["sort"]): SQL {
  switch (sort) {
    case "submitted_asc":
      return sql`lr.submitted_at asc`;
    case "sla_asc":
      return sql`lr.due_at asc nulls last, lr.submitted_at asc`;
    case "priority_desc":
      return sql`array_position(array['DARURAT','PRIORITAS','NORMAL'], lr.priority::text), lr.submitted_at desc`;
    default:
      return sql`lr.submitted_at desc`;
  }
}

export async function listLetterRequests(
  villageId: string,
  query: QueueQuery,
): Promise<QueuePage> {
  const db = await getDb();
  const filter = buildQueueFilter(villageId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [rowsResult, countResult, statusResult, dusunResult, typeResult, overdueResult] =
    await Promise.all([
      db.execute<QueueRow>(sql`
        select lr.id,
               lr.ticket,
               lr.applicant_name                          as "applicantName",
               lr.applicant_nik                           as "applicantNik",
               lr.applicant_phone                         as "applicantPhone",
               lt.code                                    as "letterCode",
               lt.name                                    as "letterName",
               lr.status::text                            as "status",
               lr.priority::text                          as "priority",
               lr.channel,
               split_part(h.name, ' - ', 1)               as "dusun",
               h.code                                     as "dusunCode",
               n.rt,
               n.rw,
               lr.documents_uploaded                      as "documentsUploaded",
               lr.documents_required                      as "documentsRequired",
               lr.compliance_note                         as "complianceNote",
               lr.submitted_at                            as "submittedAt",
               lr.due_at                                  as "dueAt",
               floor(extract(epoch from (now() - lr.submitted_at)) / 60)::int as "ageMinutes",
               case when lr.due_at is null then null
                    else floor(extract(epoch from (lr.due_at - now())) / 60)::int end as "slaMinutes",
               st.full_name                               as "assignedTo",
               st.initials                                as "assignedInitials"
        from letter_requests lr
        join letter_types lt on lt.id = lr.letter_type_id
        join neighborhoods n on n.id = lr.neighborhood_id
        join hamlets h on h.id = n.hamlet_id
        left join staff st on st.id = lr.assigned_staff_id
        where ${filter}
        order by ${queueOrder(query.sort)}
        limit ${query.pageSize} offset ${offset}
      `),

      db.execute<{ total: number }>(sql`
        select count(*)::int as total
        from letter_requests lr
        join letter_types lt on lt.id = lr.letter_type_id
        join neighborhoods n on n.id = lr.neighborhood_id
        join hamlets h on h.id = n.hamlet_id
        where ${filter}
      `),

      db.execute<{ status: string; count: number }>(sql`
        select lr.status::text as status, count(*)::int as count
        from letter_requests lr
        where lr.village_id = ${villageId}
        group by 1
      `),

      db.execute<{ dusun: string; code: string; count: number }>(sql`
        select split_part(h.name, ' - ', 1) as dusun, h.code, count(*)::int as count
        from letter_requests lr
        join neighborhoods n on n.id = lr.neighborhood_id
        join hamlets h on h.id = n.hamlet_id
        where lr.village_id = ${villageId}
        group by 1, 2
        order by 2
      `),

      db.execute<{ code: string; name: string; count: number }>(sql`
        select lt.code, lt.name, count(*)::int as count
        from letter_requests lr
        join letter_types lt on lt.id = lr.letter_type_id
        where lr.village_id = ${villageId}
        group by 1, 2
        order by 3 desc
      `),

      db.execute<{ overdue: number }>(sql`
        select count(*)::int as overdue
        from letter_requests lr
        join letter_types lt on lt.id = lr.letter_type_id
        join neighborhoods n on n.id = lr.neighborhood_id
        join hamlets h on h.id = n.hamlet_id
        where ${filter} and lr.due_at < now()
          and lr.status::text in (
            'PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP','DIVERIFIKASI','MENUNGGU_TTD_KADES'
          )
      `),
    ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    rows: rowsResult.rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    statusCounts: Object.fromEntries(statusResult.rows.map((r) => [r.status, r.count])),
    dusunCounts: dusunResult.rows.map((r) => ({ code: r.code, name: r.dusun, count: r.count })),
    letterTypeCounts: typeResult.rows,
    overdueTotal: overdueResult.rows[0]?.overdue ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Request detail (slide-over drawer)                                          */
/* -------------------------------------------------------------------------- */

export async function getRequestDetail(
  villageId: string,
  requestId: string,
): Promise<RequestDetail | null> {
  const db = await getDb();

  const head = await db.execute<{
    id: string;
    ticket: string;
    status: string;
    priority: string;
    channel: string;
    purpose: string;
    payload: Record<string, string | number | null>;
    agendaNumber: number | null;
    verificationCode: string;
    complianceNote: string | null;
    rejectionReason: string | null;
    submittedAt: string;
    dueAt: string | null;
    verifiedAt: string | null;
    signedAt: string | null;
    completedAt: string | null;
    documentsUploaded: number;
    documentsRequired: number;
    letterId: string;
    letterCode: string;
    letterName: string;
    templateTitle: string;
    slaDays: number;
    feeIdr: number;
    requiresKadesSignature: boolean;
    residentId: string | null;
    fullName: string;
    nik: string;
    phone: string | null;
    gender: string | null;
    birthPlace: string | null;
    birthDate: string | null;
    religion: string | null;
    maritalStatus: string | null;
    occupation: string | null;
    education: string | null;
    nationality: string | null;
    familyRelation: string | null;
    address: string;
    residentStatus: string | null;
    familyId: string | null;
    kkNumber: string | null;
    familyHead: string | null;
    memberCount: number | null;
    dusun: string;
    dusunCode: string;
    rt: number;
    rw: number;
    rtHead: string | null;
    officerId: string | null;
    officerName: string | null;
    officerJob: string | null;
    officerInitials: string | null;
  }>(sql`
    select lr.id,
           lr.ticket,
           lr.status::text                as status,
           lr.priority::text              as priority,
           lr.channel,
           lr.purpose,
           lr.payload,
           lr.agenda_number               as "agendaNumber",
           lr.verification_code           as "verificationCode",
           lr.compliance_note             as "complianceNote",
           lr.rejection_reason            as "rejectionReason",
           lr.submitted_at                as "submittedAt",
           lr.due_at                      as "dueAt",
           lr.verified_at                 as "verifiedAt",
           lr.signed_at                   as "signedAt",
           lr.completed_at                as "completedAt",
           lr.documents_uploaded          as "documentsUploaded",
           lr.documents_required          as "documentsRequired",
           lt.id                          as "letterId",
           lt.code                        as "letterCode",
           lt.name                        as "letterName",
           lt.template_title              as "templateTitle",
           lt.sla_days                    as "slaDays",
           lt.fee_idr                     as "feeIdr",
           lt.requires_kades_signature    as "requiresKadesSignature",
           r.id                           as "residentId",
           coalesce(r.full_name, lr.applicant_name) as "fullName",
           lr.applicant_nik               as nik,
           coalesce(r.phone, lr.applicant_phone)    as phone,
           r.gender::text                 as gender,
           r.birth_place                  as "birthPlace",
           r.birth_date                   as "birthDate",
           r.religion::text               as religion,
           r.marital_status::text         as "maritalStatus",
           r.occupation,
           r.education,
           r.nationality,
           r.family_relation              as "familyRelation",
           lr.address,
           r.status::text                 as "residentStatus",
           f.id                           as "familyId",
           f.kk_number                    as "kkNumber",
           f.head_name                    as "familyHead",
           f.member_count                 as "memberCount",
           split_part(h.name, ' - ', 1)   as dusun,
           h.code                         as "dusunCode",
           n.rt,
           n.rw,
           n.head_name                    as "rtHead",
           st.id                          as "officerId",
           st.full_name                   as "officerName",
           st.job_title                   as "officerJob",
           st.initials                    as "officerInitials"
    from letter_requests lr
    join letter_types lt on lt.id = lr.letter_type_id
    join neighborhoods n on n.id = lr.neighborhood_id
    join hamlets h on h.id = n.hamlet_id
    left join residents r on r.id = lr.applicant_resident_id
    left join families f on f.id = lr.family_id
    left join staff st on st.id = lr.assigned_staff_id
    where lr.id = ${requestId} and lr.village_id = ${villageId}
    limit 1
  `);

  const row = head.rows[0];
  if (!row) return null;

  const [attachmentResult, requirementResult, signatureResult, timelineResult] = await Promise.all([
    db.execute<AttachmentView>(sql`
      select a.id,
             a.doc_key      as "docKey",
             a.label,
             a.file_name    as "fileName",
             a.mime_type    as "mimeType",
             a.size_bytes   as "sizeBytes",
             a.status::text as status,
             a.defect_note  as "defectNote",
             a.uploaded_at  as "uploadedAt",
             vs.full_name   as "verifiedByName"
      from letter_attachments a
      left join staff vs on vs.id = a.verified_by_staff_id
      where a.request_id = ${requestId}
      order by a.uploaded_at
    `),

    db.execute<{ docKey: string; label: string; mandatory: boolean }>(sql`
      select req.doc_key as "docKey", req.label, req.mandatory
      from letter_requirements req
      where req.letter_type_id = ${row.letterId}
      order by req.sort_order
    `),

    db.execute<{
      id: string;
      status: string;
      certificateSerial: string | null;
      requestedAt: string;
      signedAt: string | null;
      expiresAt: string | null;
      requestedByName: string | null;
      signerName: string | null;
      note: string | null;
    }>(sql`
      select sr.id,
             sr.status::text          as status,
             sr.certificate_serial    as "certificateSerial",
             sr.requested_at          as "requestedAt",
             sr.signed_at             as "signedAt",
             sr.expires_at            as "expiresAt",
             rb.full_name             as "requestedByName",
             sg.full_name             as "signerName",
             sr.note
      from signature_requests sr
      left join staff rb on rb.id = sr.requested_by_staff_id
      left join staff sg on sg.id = sr.signer_staff_id
      where sr.request_id = ${requestId}
      order by sr.requested_at desc
      limit 1
    `),

    db.execute<{
      id: string;
      kind: string;
      summary: string;
      actorName: string;
      actorInitials: string;
      actorRole: string;
      occurredAt: string;
    }>(sql`
      select id,
             kind::text  as kind,
             summary,
             actor_name       as "actorName",
             actor_initials   as "actorInitials",
             actor_role       as "actorRole",
             occurred_at      as "occurredAt"
      from activity_log
      where subject_id = ${requestId}
      order by occurred_at desc
      limit 20
    `),
  ]);

  const uploadedKeys = new Set(attachmentResult.rows.map((a) => a.docKey));
  const missingRequirements = requirementResult.rows
    .filter((req) => !uploadedKeys.has(req.docKey))
    .map((req) => ({ docKey: req.docKey, label: req.label, mandatory: req.mandatory }));

  const signatureRow = signatureResult.rows[0] ?? null;

  return {
    id: row.id,
    ticket: row.ticket,
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    purpose: row.purpose,
    payload: row.payload ?? {},
    agendaNumber: row.agendaNumber,
    verificationCode: row.verificationCode,
    complianceNote: row.complianceNote,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt,
    dueAt: row.dueAt,
    verifiedAt: row.verifiedAt,
    signedAt: row.signedAt,
    completedAt: row.completedAt,
    documentsUploaded: row.documentsUploaded,
    documentsRequired: row.documentsRequired,
    letter: {
      id: row.letterId,
      code: row.letterCode,
      name: row.letterName,
      templateTitle: row.templateTitle,
      slaDays: row.slaDays,
      feeIdr: row.feeIdr,
      requiresKadesSignature: row.requiresKadesSignature,
    },
    applicant: {
      id: row.residentId,
      residentId: row.residentId,
      fullName: row.fullName,
      nik: row.nik,
      phone: row.phone,
      gender: row.gender,
      birthPlace: row.birthPlace,
      birthDate: row.birthDate,
      religion: row.religion,
      maritalStatus: row.maritalStatus,
      occupation: row.occupation,
      education: row.education,
      nationality: row.nationality,
      familyRelation: row.familyRelation,
      address: row.address,
      status: row.residentStatus,
    },
    family: {
      id: row.familyId,
      kkNumber: row.kkNumber,
      headName: row.familyHead,
      memberCount: row.memberCount,
    },
    location: {
      dusun: row.dusun,
      dusunCode: row.dusunCode,
      rt: row.rt,
      rw: row.rw,
      headName: row.rtHead,
    },
    attachments: attachmentResult.rows,
    missingRequirements,
    signature: signatureRow
      ? {
          ...signatureRow,
          status: signatureRow.status,
        }
      : null,
    officer: row.officerId
      ? {
          id: row.officerId,
          fullName: row.officerName ?? "",
          jobTitle: row.officerJob ?? "",
          initials: row.officerInitials ?? "",
        }
      : null,
    timeline: timelineResult.rows,
  };
}

/* -------------------------------------------------------------------------- */
/* Activity, notifications, reports, announcements                             */
/* -------------------------------------------------------------------------- */

export async function getActivityFeed(villageId: string, limit = 12): Promise<ActivityEntry[]> {
  const db = await getDb();
  const result = await db.execute<ActivityEntry>(sql`
    select id,
           kind::text      as kind,
           summary,
           subject_ref     as "subjectRef",
           subject_type    as "subjectType",
           subject_id      as "subjectId",
           actor_name      as "actorName",
           actor_initials  as "actorInitials",
           actor_role      as "actorRole",
           meta,
           occurred_at     as "occurredAt"
    from activity_log
    where village_id = ${villageId}
    order by occurred_at desc
    limit ${limit}
  `);
  return result.rows;
}

export async function getNotifications(
  villageId: string,
  staffId: string | null,
  limit = 8,
): Promise<NotificationEntry[]> {
  const db = await getDb();
  const result = await db.execute<NotificationEntry>(sql`
    select id, title, body, severity, href, read_at as "readAt", created_at as "createdAt"
    from notifications
    where village_id = ${villageId}
      and (recipient_staff_id is null or recipient_staff_id = ${staffId})
    order by (read_at is null) desc, created_at desc
    limit ${limit}
  `);
  return result.rows;
}

export async function getReports(villageId: string, limit = 20): Promise<ReportEntry[]> {
  const db = await getDb();
  const result = await db.execute<ReportEntry>(sql`
    select cr.id,
           cr.ticket,
           cr.reporter_name  as "reporterName",
           cr.subject,
           cr.category,
           cr.body,
           cr.status,
           cr.priority::text as priority,
           split_part(h.name, ' - ', 1) as dusun,
           n.rt,
           n.rw,
           st.full_name      as "handledByName",
           cr.response_count as "responseCount",
           cr.submitted_at   as "submittedAt",
           cr.resolved_at    as "resolvedAt"
    from citizen_reports cr
    left join neighborhoods n on n.id = cr.neighborhood_id
    left join hamlets h on h.id = n.hamlet_id
    left join staff st on st.id = cr.handled_by_staff_id
    where cr.village_id = ${villageId}
    order by array_position(array['NEW','IN_PROGRESS','RESOLVED','REJECTED'], cr.status), cr.submitted_at desc
    limit ${limit}
  `);
  return result.rows;
}

export async function getAnnouncements(villageId: string, limit = 6): Promise<AnnouncementEntry[]> {
  const db = await getDb();
  const result = await db.execute<AnnouncementEntry>(sql`
    select a.id,
           a.title,
           a.slug,
           a.excerpt,
           a.channel::text as channel,
           a.status::text  as status,
           a.priority::text as priority,
           a.pinned,
           a.audience,
           st.full_name    as "authorName",
           a.publish_at    as "publishAt",
           a.view_count    as "viewCount",
           a.created_at    as "createdAt"
    from announcements a
    left join staff st on st.id = a.author_staff_id
    where a.village_id = ${villageId}
    order by a.pinned desc, coalesce(a.publish_at, a.created_at) desc
    limit ${limit}
  `);
  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* Global instant search                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fans out across the population register, the letter queue and the citizen
 * report log in one round trip. NIK and KK matching is prefix-based so it can
 * use the unique indexes rather than a sequential scan.
 */
export async function globalSearch(
  villageId: string,
  term: string,
  limit: number,
): Promise<SearchResults> {
  const db = await getDb();
  const pattern = `%${term}%`;
  const digits = term.replace(/\D/g, "");
  const numeric = digits.length >= 6 ? digits : null;

  const [residents, requests, reports, totals] = await Promise.all([
    db.execute<SearchResults["residents"][number]>(sql`
      select r.id,
             r.full_name as "fullName",
             r.nik,
             f.kk_number as "kkNumber",
             split_part(h.name, ' - ', 1) as dusun,
             n.rt,
             n.rw,
             r.status::text as status,
             extract(year from age(r.birth_date))::int as age
      from residents r
      join neighborhoods n on n.id = r.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      left join families f on f.id = r.family_id
      where r.village_id = ${villageId}
        and (
          r.full_name ilike ${pattern}
          ${numeric ? sql`or r.nik like ${`${numeric}%`} or f.kk_number like ${`${numeric}%`}` : sql``}
        )
      order by r.status = 'AKTIF' desc, r.full_name
      limit ${limit}
    `),

    db.execute<SearchResults["requests"][number]>(sql`
      select lr.id,
             lr.ticket,
             lr.applicant_name as "applicantName",
             lt.code           as "letterCode",
             lr.status::text   as status,
             lr.submitted_at   as "submittedAt"
      from letter_requests lr
      join letter_types lt on lt.id = lr.letter_type_id
      where lr.village_id = ${villageId}
        and (
          lr.applicant_name ilike ${pattern}
          or lr.ticket ilike ${pattern}
          ${numeric ? sql`or lr.applicant_nik like ${`${numeric}%`}` : sql``}
        )
      order by lr.submitted_at desc
      limit ${limit}
    `),

    db.execute<SearchResults["reports"][number]>(sql`
      select cr.id, cr.ticket, cr.subject, cr.status
      from citizen_reports cr
      where cr.village_id = ${villageId}
        and (cr.subject ilike ${pattern} or cr.ticket ilike ${pattern} or cr.reporter_name ilike ${pattern})
      order by cr.submitted_at desc
      limit ${limit}
    `),

    db.execute<{ residents: number; requests: number; reports: number }>(sql`
      select
        (select count(*)::int from residents r
          left join families f on f.id = r.family_id
          where r.village_id = ${villageId} and (
            r.full_name ilike ${pattern}
            ${numeric ? sql`or r.nik like ${`${numeric}%`} or f.kk_number like ${`${numeric}%`}` : sql``}
          )) as residents,
        (select count(*)::int from letter_requests lr
          where lr.village_id = ${villageId} and (
            lr.applicant_name ilike ${pattern} or lr.ticket ilike ${pattern}
            ${numeric ? sql`or lr.applicant_nik like ${`${numeric}%`}` : sql``}
          )) as requests,
        (select count(*)::int from citizen_reports cr
          where cr.village_id = ${villageId} and (
            cr.subject ilike ${pattern} or cr.ticket ilike ${pattern} or cr.reporter_name ilike ${pattern}
          )) as reports
    `),
  ]);

  const total = totals.rows[0];

  return {
    residents: residents.rows,
    requests: requests.rows,
    reports: reports.rows,
    totalMatches: (total?.residents ?? 0) + (total?.requests ?? 0) + (total?.reports ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Trend + options                                                             */
/* -------------------------------------------------------------------------- */

export async function getServiceTrend(villageId: string, days = 14): Promise<ServiceTrendPoint[]> {
  const db = await getDb();
  const result = await db.execute<ServiceTrendPoint>(sql`
    select stat_date::text as "statDate",
           letters_received as received,
           letters_completed as completed,
           letters_rejected as rejected
    from daily_stats
    where village_id = ${villageId}
    order by stat_date desc
    limit ${days}
  `);
  return result.rows.reverse();
}

/** Everything the first paint of the dashboard needs, in one HTTP call. */
export async function getWorkspaceOverview(query: QueueQuery): Promise<WorkspaceOverview | null> {
  const village = await getVillageProfile();
  if (!village) return null;

  const officer = await getActiveOfficer(village.id);

  const [kpi, queue, activity, notifications, reports, announcements, trend] = await Promise.all([
    getKpiSummary(village.id),
    listLetterRequests(village.id, query),
    getActivityFeed(village.id, 10),
    getNotifications(village.id, officer?.id ?? null),
    getReports(village.id, 12),
    getAnnouncements(village.id, 5),
    getServiceTrend(village.id, 14),
  ]);

  const db = await getDb();
  const dusunRows = await db.execute<{ code: string; name: string; count: number }>(sql`
      select h.code,
             split_part(h.name, ' - ', 1) as name,
             count(n.id)::int as count
      from hamlets h
      left join neighborhoods n on n.hamlet_id = h.id
      where h.village_id = ${village.id}
    group by 1, 2
    order by 1
  `);

  return {
    village,
    officer,
    kpi,
    queue,
    activity,
    notifications,
    reports,
    announcements,
    trend,
    letterTypes: queue.letterTypeCounts.map((t) => ({ code: t.code, name: t.name, count: t.count })),
    dusunOptions: dusunRows.rows,
    serverTime: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Citizen reports workspace (route: /laporan, summary on /)                    */
/* -------------------------------------------------------------------------- */

export type ReportSummary = {
  total: number;
  newCount: number;
  inProgress: number;
  resolved: number;
  rejected: number;
  unanswered: number;
  receivedThisMonth: number;
  resolvedThisMonth: number;
  /** Average hours from submission to resolution, over resolved reports. */
  avgResolveHours: number | null;
  topCategory: { category: string; count: number } | null;
  lastSubmittedAt: string | null;
};

export type ReportRow = ReportEntry & {
  reporterNik: string;
  reporterPhone: string | null;
  hamletName: string | null;
  handledByInitials: string | null;
  /** Whole days the report has been sitting open (0 for today's filings). */
  openDays: number;
};

export type ReportPage = {
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  categoryCounts: { category: string; count: number }[];
  dusunCounts: { code: string; name: string; count: number }[];
  summary: ReportSummary;
};

function buildReportFilter(villageId: string, query: ReportQuery): SQL {
  const conditions: SQL[] = [sql`cr.village_id = ${villageId}`];

  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(sql`(
      cr.subject ilike ${pattern}
      or cr.body ilike ${pattern}
      or cr.ticket ilike ${pattern}
      or cr.reporter_name ilike ${pattern}
    )`);
  }
  if (query.status?.length) {
    conditions.push(inList(sql`cr.status::text`, query.status));
  }
  if (query.category?.length) {
    conditions.push(inList(sql`cr.category`, query.category));
  }
  if (query.dusun?.length) {
    conditions.push(inList(sql`h.code`, query.dusun));
  }
  if (query.response === "unanswered") {
    conditions.push(sql`cr.response_count = 0`);
  } else if (query.response === "answered") {
    conditions.push(sql`cr.response_count > 0`);
  }

  return sql.join(conditions, sql` and `);
}

function reportOrder(sort: ReportQuery["sort"]): SQL {
  switch (sort) {
    case "oldest":
      return sql`cr.submitted_at asc`;
    case "priority_desc":
      return sql`array_position(array['DARURAT','PRIORITAS','NORMAL'], cr.priority::text), cr.submitted_at desc`;
    case "unanswered_first":
      return sql`(cr.response_count > 0), array_position(array['NEW','IN_PROGRESS','RESOLVED','REJECTED'], cr.status), cr.submitted_at desc`;
    default:
      return sql`cr.submitted_at desc`;
  }
}

/**
 * One page of citizen reports, plus the facets and the summary card numbers.
 *
 * Six statements run in a single batch: the page, the filtered count, the status
 * and category facets, the dusun facet, and the village-wide summary. The
 * summary deliberately ignores the active filters — it is the "how are we
 * doing" figure an officer quotes in a meeting, not a re-count of the table.
 */
export async function listReports(villageId: string, query: ReportQuery): Promise<ReportPage> {
  const db = await getDb();
  const filter = buildReportFilter(villageId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [rowsResult, countResult, statusResult, categoryResult, dusunResult, summaryResult] =
    await Promise.all([
      db.execute<ReportRow>(sql`
        select cr.id,
               cr.ticket,
               cr.reporter_name  as "reporterName",
               cr.reporter_nik   as "reporterNik",
               cr.reporter_phone as "reporterPhone",
               cr.subject,
               cr.category,
               cr.body,
               cr.status,
               cr.priority::text as priority,
               split_part(h.name, ' - ', 1) as dusun,
               h.name            as "hamletName",
               n.rt,
               n.rw,
               st.full_name      as "handledByName",
               st.initials       as "handledByInitials",
               cr.response_count as "responseCount",
               cr.submitted_at   as "submittedAt",
               cr.resolved_at    as "resolvedAt",
               floor(extract(epoch from (now() - cr.submitted_at)) / 86400)::int as "openDays"
        from citizen_reports cr
        left join neighborhoods n on n.id = cr.neighborhood_id
        left join hamlets h on h.id = n.hamlet_id
        left join staff st on st.id = cr.handled_by_staff_id
        where ${filter}
        order by ${reportOrder(query.sort)}
        limit ${query.pageSize} offset ${offset}
      `),

      db.execute<{ total: number }>(sql`
        select count(*)::int as total
        from citizen_reports cr
        left join neighborhoods n on n.id = cr.neighborhood_id
        left join hamlets h on h.id = n.hamlet_id
        where ${filter}
      `),

      db.execute<{ status: string; count: number }>(sql`
        select cr.status, count(*)::int as count
        from citizen_reports cr
        where cr.village_id = ${villageId}
        group by 1
      `),

      db.execute<{ category: string; count: number }>(sql`
        select cr.category, count(*)::int as count
        from citizen_reports cr
        where cr.village_id = ${villageId}
        group by 1
        order by 2 desc, 1
      `),

      db.execute<{ code: string; name: string; count: number }>(sql`
        select h.code, split_part(h.name, ' - ', 1) as name, count(*)::int as count
        from citizen_reports cr
        join neighborhoods n on n.id = cr.neighborhood_id
        join hamlets h on h.id = n.hamlet_id
        where cr.village_id = ${villageId}
        group by 1, 2
        order by 1
      `),

      db.execute<ReportSummary>(sql`
        select count(*)::int                                                    as total,
               count(*) filter (where status = 'NEW')::int                      as "newCount",
               count(*) filter (where status = 'IN_PROGRESS')::int              as "inProgress",
               count(*) filter (where status = 'RESOLVED')::int                 as resolved,
               count(*) filter (where status = 'REJECTED')::int                 as rejected,
               count(*) filter (where response_count = 0)::int                  as unanswered,
               count(*) filter (where submitted_at >= date_trunc('month', now()))::int as "receivedThisMonth",
               count(*) filter (where resolved_at >= date_trunc('month', now()))::int  as "resolvedThisMonth",
               round(avg(extract(epoch from (resolved_at - submitted_at)) / 3600)
                     filter (where resolved_at is not null))::float8          as "avgResolveHours",
               max(submitted_at)                                               as "lastSubmittedAt"
        from citizen_reports
        where village_id = ${villageId}
      `),
    ]);

  const total = countResult.rows[0]?.total ?? 0;
  const summary = summaryResult.rows[0] ?? {
    total: 0,
    newCount: 0,
    inProgress: 0,
    resolved: 0,
    rejected: 0,
    unanswered: 0,
    receivedThisMonth: 0,
    resolvedThisMonth: 0,
    avgResolveHours: null,
    topCategory: null,
    lastSubmittedAt: null,
  };

  const categoryCounts = categoryResult.rows.map((row) => ({
    category: row.category,
    count: row.count,
  }));

  return {
    rows: rowsResult.rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    statusCounts: Object.fromEntries(statusResult.rows.map((r) => [r.status, r.count])),
    categoryCounts,
    dusunCounts: dusunResult.rows,
    summary: { ...summary, topCategory: categoryCounts[0] ?? null },
  };
}

/* -------------------------------------------------------------------------- */
/* Population registry (routes: /penduduk, /keluarga)                           */
/* -------------------------------------------------------------------------- */

export type ResidentRow = {
  id: string;
  nik: string;
  fullName: string;
  gender: string;
  birthPlace: string;
  birthDate: string;
  age: number;
  religion: string;
  maritalStatus: string;
  education: string | null;
  occupation: string | null;
  familyRelation: string | null;
  kkNumber: string | null;
  dusun: string;
  dusunCode: string;
  rt: number;
  rw: number;
  address: string;
  phone: string | null;
  status: string;
  documentsVerified: boolean;
};

export type FamilyRow = {
  id: string;
  kkNumber: string;
  headName: string;
  headNik: string | null;
  memberCount: number;
  welfareClass: string | null;
  dusun: string;
  dusunCode: string;
  rt: number;
  rw: number;
  address: string;
};

export type RegistryPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  dusunCounts: { code: string; name: string; count: number }[];
  totals: {
    residents: number;
    families: number;
    male: number;
    female: number;
    /** Residents flagged as needing follow-up (dead, moved out, unknown). */
    inactive: number;
    members: number;
  };
};

function buildResidentFilter(villageId: string, query: RegistryQuery): SQL {
  const conditions: SQL[] = [sql`r.village_id = ${villageId}`];

  if (query.q) {
    const pattern = `%${query.q}%`;
    const digits = query.q.replace(/\D/g, "");
    conditions.push(sql`(
      r.full_name ilike ${pattern}
      ${digits.length >= 4 ? sql`or r.nik like ${`${digits}%`} or f.kk_number like ${`${digits}%`}` : sql``}
    )`);
  }
  if (query.status?.length) {
    conditions.push(inList(sql`r.status::text`, query.status));
  }
  if (query.dusun?.length) {
    conditions.push(inList(sql`h.code`, query.dusun));
  }
  return sql.join(conditions, sql` and `);
}

function buildFamilyFilter(villageId: string, query: RegistryQuery): SQL {
  const conditions: SQL[] = [sql`f.village_id = ${villageId}`];

  if (query.q) {
    const pattern = `%${query.q}%`;
    const digits = query.q.replace(/\D/g, "");
    conditions.push(sql`(
      f.head_name ilike ${pattern}
      ${digits.length >= 4 ? sql`or f.kk_number like ${`${digits}%`}` : sql``}
    )`);
  }
  if (query.dusun?.length) {
    conditions.push(inList(sql`h.code`, query.dusun));
  }
  return sql.join(conditions, sql` and `);
}

function registryOrder(sort: RegistryQuery["sort"]): SQL {
  switch (sort) {
    case "name_desc":
      return sql`r.full_name desc`;
    case "newest":
      return sql`r.created_at desc`;
    case "dusun_asc":
      return sql`h.code asc, r.full_name asc`;
    default:
      return sql`r.full_name asc`;
  }
}

/** One page of the resident registry plus its demographic roll-ups. */
export async function listResidents(
  villageId: string,
  query: RegistryQuery,
): Promise<RegistryPage<ResidentRow>> {
  const db = await getDb();
  const filter = buildResidentFilter(villageId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [rowsResult, countResult, statusResult, dusunResult, totalsResult] = await Promise.all([
    db.execute<ResidentRow>(sql`
      select r.id,
             r.nik,
             r.full_name        as "fullName",
             r.gender,
             r.birth_place      as "birthPlace",
             r.birth_date       as "birthDate",
             date_part('year', age(r.birth_date))::int as age,
             r.religion,
             r.marital_status   as "maritalStatus",
             r.education,
             r.occupation,
             r.family_relation  as "familyRelation",
             f.kk_number        as "kkNumber",
             split_part(h.name, ' - ', 1) as dusun,
             h.code             as "dusunCode",
             n.rt,
             n.rw,
             r.address,
             r.phone,
             r.status,
             r.documents_verified as "documentsVerified"
      from residents r
      join neighborhoods n on n.id = r.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      left join families f on f.id = r.family_id
      where ${filter}
      order by ${registryOrder(query.sort)}
      limit ${query.pageSize} offset ${offset}
    `),

    db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from residents r
      join neighborhoods n on n.id = r.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      left join families f on f.id = r.family_id
      where ${filter}
    `),

    db.execute<{ status: string; count: number }>(sql`
      select r.status::text as status, count(*)::int as count
      from residents r
      where r.village_id = ${villageId}
      group by 1
    `),

    db.execute<{ code: string; name: string; count: number }>(sql`
      select h.code, split_part(h.name, ' - ', 1) as name, count(*)::int as count
      from residents r
      join neighborhoods n on n.id = r.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      where r.village_id = ${villageId}
      group by 1, 2
      order by 1
    `),

    db.execute<{
      residents: number;
      families: number;
      male: number;
      female: number;
      inactive: number;
      members: number;
    }>(sql`
      select (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF') as residents,
             (select count(*)::int from families where village_id = ${villageId}) as families,
             (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF' and gender = 'L') as male,
             (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF' and gender = 'P') as female,
             (select count(*)::int from residents where village_id = ${villageId} and status <> 'AKTIF') as inactive,
             (select coalesce(sum(member_count), 0)::int from families where village_id = ${villageId}) as members
    `),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    rows: rowsResult.rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    statusCounts: Object.fromEntries(statusResult.rows.map((r) => [r.status, r.count])),
    dusunCounts: dusunResult.rows,
    totals: totalsResult.rows[0] ?? {
      residents: 0,
      families: 0,
      male: 0,
      female: 0,
      inactive: 0,
      members: 0,
    },
  };
}

/** One page of Kartu Keluarga records, with the same roll-ups. */
export async function listFamilies(
  villageId: string,
  query: RegistryQuery,
): Promise<RegistryPage<FamilyRow>> {
  const db = await getDb();
  const filter = buildFamilyFilter(villageId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [rowsResult, countResult, dusunResult, totalsResult] = await Promise.all([
    db.execute<FamilyRow>(sql`
      select f.id,
             f.kk_number     as "kkNumber",
             f.head_name     as "headName",
             head.nik        as "headNik",
             f.member_count  as "memberCount",
             f.welfare_class as "welfareClass",
             split_part(h.name, ' - ', 1) as dusun,
             h.code          as "dusunCode",
             n.rt,
             n.rw,
             f.address
      from families f
      join neighborhoods n on n.id = f.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      left join lateral (
        select r.nik
        from residents r
        where r.family_id = f.id
          and upper(coalesce(r.family_relation, '')) = 'KEPALA KELUARGA'
        limit 1
      ) head on true
      where ${filter}
      order by f.head_name asc
      limit ${query.pageSize} offset ${offset}
    `),

    db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from families f
      join neighborhoods n on n.id = f.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      where ${filter}
    `),

    db.execute<{ code: string; name: string; count: number }>(sql`
      select h.code, split_part(h.name, ' - ', 1) as name, count(*)::int as count
      from families f
      join neighborhoods n on n.id = f.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      where f.village_id = ${villageId}
      group by 1, 2
      order by 1
    `),

    db.execute<{
      residents: number;
      families: number;
      male: number;
      female: number;
      inactive: number;
      members: number;
    }>(sql`
      select (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF') as residents,
             (select count(*)::int from families where village_id = ${villageId}) as families,
             (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF' and gender = 'L') as male,
             (select count(*)::int from residents where village_id = ${villageId} and status = 'AKTIF' and gender = 'P') as female,
             (select count(*)::int from residents where village_id = ${villageId} and status <> 'AKTIF') as inactive,
             (select coalesce(sum(member_count), 0)::int from families where village_id = ${villageId}) as members
    `),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    rows: rowsResult.rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    statusCounts: {},
    dusunCounts: dusunResult.rows,
    totals: totalsResult.rows[0] ?? {
      residents: 0,
      families: 0,
      male: 0,
      female: 0,
      inactive: 0,
      members: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Area & staffing (routes: /wilayah, /pengaturan)                              */
/* -------------------------------------------------------------------------- */

export type HamletArea = {
  id: string;
  name: string;
  code: string;
  headName: string | null;
  neighborhoodCount: number;
  residents: number;
  families: number;
  reports: number;
  requests: number;
};

export type NeighborhoodArea = {
  id: string;
  hamlet: string;
  hamletCode: string;
  rt: number;
  rw: number;
  headName: string | null;
  residents: number;
  families: number;
};

export type AreaOverview = {
  hamlets: HamletArea[];
  neighborhoods: NeighborhoodArea[];
};

/** Dusun/RT/RW breakdown with the population each area carries. */
export async function listAreas(villageId: string): Promise<AreaOverview> {
  const db = await getDb();

  const [hamletResult, neighborhoodResult] = await Promise.all([
    db.execute<HamletArea>(sql`
      select h.id,
             h.name,
             h.code,
             h.head_name as "headName",
             (select count(*)::int from neighborhoods n where n.hamlet_id = h.id) as "neighborhoodCount",
             (select count(*)::int from residents r
                join neighborhoods n on n.id = r.neighborhood_id
               where n.hamlet_id = h.id and r.status = 'AKTIF') as residents,
             (select count(*)::int from families f
                join neighborhoods n on n.id = f.neighborhood_id
               where n.hamlet_id = h.id) as families,
             (select count(*)::int from citizen_reports cr
                join neighborhoods n on n.id = cr.neighborhood_id
               where n.hamlet_id = h.id) as reports,
             (select count(*)::int from letter_requests lr
                join neighborhoods n on n.id = lr.neighborhood_id
               where n.hamlet_id = h.id) as requests
      from hamlets h
      where h.village_id = ${villageId}
      order by h.code
    `),

    db.execute<NeighborhoodArea>(sql`
      select n.id,
             h.name as hamlet,
             h.code as "hamletCode",
             n.rt,
             n.rw,
             n.head_name as "headName",
             (select count(*)::int from residents r
               where r.neighborhood_id = n.id and r.status = 'AKTIF') as residents,
             (select count(*)::int from families f where f.neighborhood_id = n.id) as families
      from neighborhoods n
      join hamlets h on h.id = n.hamlet_id
      where h.village_id = ${villageId}
      order by h.code, n.rw, n.rt
    `),
  ]);

  return { hamlets: hamletResult.rows, neighborhoods: neighborhoodResult.rows };
}

export type StaffMember = {
  id: string;
  fullName: string;
  jobTitle: string;
  role: string;
  nipd: string | null;
  email: string;
  phone: string | null;
  initials: string;
  canSign: boolean;
  active: boolean;
  lastSeenAt: string | null;
  onShiftSince: string | null;
  station: string | null;
  openRequests: number;
};

export async function listStaff(villageId: string): Promise<StaffMember[]> {
  const db = await getDb();
  const result = await db.execute<StaffMember>(sql`
    select s.id,
           s.full_name as "fullName",
           s.job_title as "jobTitle",
           s.role::text as role,
           s.nipd,
           s.email,
           s.phone,
           s.initials,
           s.can_sign  as "canSign",
           s.active,
           s.last_seen_at as "lastSeenAt",
           sh.started_at  as "onShiftSince",
           sh.station,
           (select count(*)::int from letter_requests lr
             where lr.assigned_staff_id = s.id
               and lr.status::text in ('PENDING_VERIFIKASI','DIVERIFIKASI','MENUNGGU_TTD_KADES')) as "openRequests"
    from staff s
    left join lateral (
      select started_at, station
      from staff_shifts
      where staff_id = s.id and ended_at is null
      order by started_at desc
      limit 1
    ) sh on true
    where s.village_id = ${villageId}
    order by s.active desc, s.role, s.full_name
  `);
  return result.rows;
}

export type LetterTypeEntry = {
  code: string;
  name: string;
  slaDays: number;
  requirementCount: number;
  issued: number;
};

/** The service catalogue: what the village issues and how long it may take. */
export async function listLetterTypes(villageId: string): Promise<LetterTypeEntry[]> {
  const db = await getDb();
  const result = await db.execute<LetterTypeEntry>(sql`
    select lt.code,
           lt.name,
           lt.sla_days as "slaDays",
           (select count(*)::int from letter_requirements lreq where lreq.letter_type_id = lt.id) as "requirementCount",
           (select count(*)::int from letter_requests lr
             where lr.letter_type_id = lt.id and lr.status::text in ('DITANDATANGANI','SIAP_DIAMBIL','SELESAI')) as issued
    from letter_types lt
    where lt.village_id = ${villageId}
    order by lt.name
  `);
  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* Signature agenda & letter archive (routes: /ttd, /arsip)                     */
/* -------------------------------------------------------------------------- */

export type SignatureQueueEntry = {
  id: string;
  status: string;
  certificateSerial: string | null;
  requestedAt: string;
  signedAt: string | null;
  note: string | null;
  signerName: string | null;
  signerInitials: string | null;
  requestId: string;
  ticket: string;
  applicantName: string;
  letterCode: string;
  letterName: string;
  /** Hours the document has been waiting for the Kepala Desa. */
  waitingHours: number | null;
};

export async function listSignatureQueue(
  villageId: string,
  limit = 20,
): Promise<SignatureQueueEntry[]> {
  const db = await getDb();
  const result = await db.execute<SignatureQueueEntry>(sql`
    select sr.id,
           sr.status::text as status,
           sr.certificate_serial as "certificateSerial",
           sr.requested_at as "requestedAt",
           sr.signed_at as "signedAt",
           sr.note,
           st.full_name as "signerName",
           st.initials  as "signerInitials",
           lr.id        as "requestId",
           lr.ticket,
           lr.applicant_name as "applicantName",
           lt.code      as "letterCode",
           lt.name      as "letterName",
           case when sr.status::text = 'MENUNGGU'
                then floor(extract(epoch from (now() - sr.requested_at)) / 3600)::int
                else null end as "waitingHours"
    from signature_requests sr
    join letter_requests lr on lr.id = sr.request_id
    join letter_types lt on lt.id = lr.letter_type_id
    left join staff st on st.id = sr.signer_staff_id
    where lr.village_id = ${villageId}
    order by (sr.status::text <> 'MENUNGGU'), sr.requested_at desc
    limit ${limit}
  `);
  return result.rows;
}

/** Statuses that mean "the document has left the worklist and is on file". */
export const ARCHIVED_REQUEST_STATUSES = [
  "DITANDATANGANI",
  "SIAP_DIAMBIL",
  "SELESAI",
  "DITOLAK",
] as const;

export type ArchivedLetter = {
  id: string;
  ticket: string;
  applicantName: string;
  letterCode: string;
  letterName: string;
  status: string;
  dusun: string;
  rt: number;
  rw: number;
  verificationCode: string;
  agendaNumber: number | null;
  certificateSerial: string | null;
  signedAt: string | null;
  completedAt: string | null;
  submittedAt: string;
  rejectionReason: string | null;
};

export type ArchivePage = {
  rows: ArchivedLetter[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  signedTotal: number;
};

/**
 * Issued, collected and rejected letters — the office's own copy of the file.
 *
 * The status filter is intersected with the archived set, so asking for a
 * status that has not left the worklist returns nothing instead of leaking
 * pending letters into the archive.
 */
export async function listArchivedLetters(
  villageId: string,
  query: QueueQuery,
): Promise<ArchivePage> {
  const db = await getDb();
  const conditions: SQL[] = [
    sql`lr.village_id = ${villageId}`,
    inList(sql`lr.status::text`, ARCHIVED_REQUEST_STATUSES),
  ];

  if (query.status?.length) {
    conditions.push(inList(sql`lr.status::text`, query.status));
  }
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(sql`(
      lr.applicant_name ilike ${pattern}
      or lr.ticket ilike ${pattern}
      or lr.verification_code ilike ${pattern}
      or lt.name ilike ${pattern}
    )`);
  }
  if (query.dusun?.length) {
    conditions.push(inList(sql`h.code`, query.dusun));
  }

  const filter = sql.join(conditions, sql` and `);
  const offset = (query.page - 1) * query.pageSize;

  const [rowsResult, countResult, statusResult, signedResult] = await Promise.all([
    db.execute<ArchivedLetter>(sql`
      select lr.id,
             lr.ticket,
             lr.applicant_name as "applicantName",
             lt.code as "letterCode",
             lt.name as "letterName",
             lr.status::text as status,
             split_part(h.name, ' - ', 1) as dusun,
             n.rt,
             n.rw,
             lr.verification_code as "verificationCode",
             lr.agenda_number as "agendaNumber",
             sr.certificate_serial as "certificateSerial",
             lr.signed_at as "signedAt",
             lr.completed_at as "completedAt",
             lr.submitted_at as "submittedAt",
             lr.rejection_reason as "rejectionReason"
      from letter_requests lr
      join letter_types lt on lt.id = lr.letter_type_id
      join neighborhoods n on n.id = lr.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      left join signature_requests sr on sr.request_id = lr.id
      where ${filter}
      order by coalesce(lr.completed_at, lr.signed_at, lr.submitted_at) desc
      limit ${query.pageSize} offset ${offset}
    `),

    db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from letter_requests lr
      join letter_types lt on lt.id = lr.letter_type_id
      join neighborhoods n on n.id = lr.neighborhood_id
      join hamlets h on h.id = n.hamlet_id
      where ${filter}
    `),

    db.execute<{ status: string; count: number }>(sql`
      select lr.status::text as status, count(*)::int as count
      from letter_requests lr
      where lr.village_id = ${villageId}
        and ${inList(sql`lr.status::text`, ARCHIVED_REQUEST_STATUSES)}
      group by 1
    `),

    db.execute<{ signed: number }>(sql`
      select count(*)::int as signed
      from signature_requests sr
      join letter_requests lr on lr.id = sr.request_id
      where lr.village_id = ${villageId} and sr.status::text = 'DITANDATANGANI'
    `),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    rows: rowsResult.rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    statusCounts: Object.fromEntries(statusResult.rows.map((r) => [r.status, r.count])),
    signedTotal: signedResult.rows[0]?.signed ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Chrome payload (every route)                                                 */
/* -------------------------------------------------------------------------- */

export type ShellPayload = {
  village: VillageProfile;
  officer: ActiveOfficer | null;
  notifications: NotificationEntry[];
  counts: {
    queueTotal: number;
    unprocessed: number;
    awaitingSignature: number;
    reportsNew: number;
    reportsOpen: number;
    residents: number;
    families: number;
    announcementsPublished: number;
  };
  serverTime: string;
};

/**
 * The minimum the persistent chrome needs: identity, shift, bell and the badge
 * numbers on the rail. Every route fetches this; only the landing and the
 * service workspaces fetch anything heavier.
 */
export async function getShellPayload(): Promise<ShellPayload | null> {
  const village = await getVillageProfile();
  if (!village) return null;

  const db = await getDb();
  const officer = await getActiveOfficer(village.id);

  const [notifications, countsResult] = await Promise.all([
    getNotifications(village.id, officer?.id ?? null),
    db.execute<{
      queueTotal: number;
      unprocessed: number;
      awaitingSignature: number;
      reportsNew: number;
      reportsOpen: number;
      residents: number;
      families: number;
      announcementsPublished: number;
    }>(sql`
      select (select count(*)::int from letter_requests where village_id = ${village.id}) as "queueTotal",
             (select count(*)::int from letter_requests
               where village_id = ${village.id}
                 and status::text in ('PENDING_VERIFIKASI','BERKAS_TIDAK_LENGKAP')) as "unprocessed",
             (select count(*)::int from letter_requests
               where village_id = ${village.id} and status::text = 'MENUNGGU_TTD_KADES') as "awaitingSignature",
             (select count(*)::int from citizen_reports
               where village_id = ${village.id} and status = 'NEW') as "reportsNew",
             (select count(*)::int from citizen_reports
               where village_id = ${village.id} and status in ('NEW','IN_PROGRESS')) as "reportsOpen",
             (select count(*)::int from residents
               where village_id = ${village.id} and status = 'AKTIF') as residents,
             (select count(*)::int from families where village_id = ${village.id}) as families,
             (select count(*)::int from announcements
               where village_id = ${village.id} and status::text = 'TERBIT') as "announcementsPublished"
    `),
  ]);

  return {
    village,
    officer,
    notifications,
    counts: countsResult.rows[0] ?? {
      queueTotal: 0,
      unprocessed: 0,
      awaitingSignature: 0,
      reportsNew: 0,
      reportsOpen: 0,
      residents: 0,
      families: 0,
      announcementsPublished: 0,
    },
    serverTime: new Date().toISOString(),
  };
}
