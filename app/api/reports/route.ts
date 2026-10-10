import { DomainError, createCitizenReport } from "@/db/commands";
import { getVillageProfile, listReports } from "@/db/queries";
import { getCurrentActor } from "@/lib/auth/session";
import { parseReportQuery, reportDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
     await requireStaffSession();
    const query = parseReportQuery(params);

    const village = await getVillageProfile();

    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    const page = await listReports(village.id, query);

    return {
      ...page,
      query,
      serverTime: new Date().toISOString(),
    };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    // A resident files through the portal; an officer records a loket filing on
    // somebody's behalf. Authenticate before touching the body so an anonymous
    // probe never learns the validation rules.
    const actor = await getCurrentActor();
    if (!actor) {
      throw new DomainError(
        "Sesi tidak ditemukan atau telah berakhir. Silakan masuk kembali.",
        "UNAUTHENTICATED",
        401,
      );
    }

    const draft = await parseBody(reportDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const report = await createCitizenReport({
      villageId: village.id,
      residentId: actor.type === "RESIDENT" ? actor.resident.id : null,
      staffId: actor.type === "STAFF" ? actor.staff.id : null,
      draft,
    });

    return {
      ok: true,
      report: {
        id: report.id,
        ticket: report.ticket,
        category: report.category,
        subject: report.subject,
        status: report.status,
        priority: report.priority,
        submittedAt: report.submittedAt,
      },
    };
  });
}
