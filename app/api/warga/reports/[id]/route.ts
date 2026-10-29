import {
  DomainError,
  deleteCitizenReport,
  updateCitizenReport,
} from "@/db/commands";
import { getResidentReport, getVillageProfile } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";
import { deleteAttachments } from "@/lib/attachments";
import { reportUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/warga/reports/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const found = await getResidentReport(village.id, actor.resident.id, id);
    if (!found) {
      throw new DomainError("Laporan tidak ditemukan.", "REPORT_NOT_FOUND", 404);
    }

    return { ok: true, report: found.report, attachments: found.attachments };
  });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/warga/reports/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const actor = await requireResidentSession();

    const draft = await parseBody(reportUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const report = await updateCitizenReport({
      villageId: village.id,
      residentId: actor.resident.id,
      reportId: id,
      draft,
    });

    return {
      ok: true,
      report: {
        id: report.id,
        ticket: report.ticket,
        category: report.category,
        subject: report.subject,
        body: report.body,
        status: report.status,
        priority: report.priority,
        neighborhoodId: report.neighborhoodId,
      },
    };
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/warga/reports/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const deleted = await deleteCitizenReport({
      villageId: village.id,
      residentId: actor.resident.id,
      reportId: id,
    });

    await deleteAttachments(deleted.storageKeys);

    return {
      ok: true,
      report: {
        id: deleted.id,
        ticket: deleted.ticket,
        subject: deleted.subject,
      },
    };
  });
}