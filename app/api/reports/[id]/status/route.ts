import { advanceReport } from "@/db/commands";
import { requireStaffCapability } from "@/lib/auth/guard";
import { reportAdvanceSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/reports/[id]/status">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(reportAdvanceSchema, request);
    const { officer, staff } = await requireStaffCapability("verify");

    const report = await advanceReport({
      villageId: staff.villageId,
      reportId: id,
      staffId: officer.id,
      status: payload.status,
      note: payload.note,
      reason: payload.reason,
    });

    return {
      ok: true,
      ticket: report.ticket,
      status: report.status,
      resolvedAt: report.resolvedAt,
      rejectionReason: report.rejectionReason,
      responseCount: report.responseCount,
    };
  });
}