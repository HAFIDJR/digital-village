import { advanceReport } from "@/db/commands";
import { requireStaffCapability } from "@/lib/auth/guard";
import { reportAdvanceSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Officer follow-up on a resident report: acknowledge it, close it as handled,
 * or reject it with a note. The resident portal reads the same row, so the new
 * status appears there on the next refetch.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/reports/[id]/status">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(reportAdvanceSchema, request);

    // Same authority that verifies letter requests: the service desk roles.
    const { officer, staff } = await requireStaffCapability("verify");

    const report = await advanceReport({
      villageId: staff.villageId,
      reportId: id,
      staffId: officer.id,
      status: payload.status,
      note: payload.note,
    });

    return {
      ok: true,
      ticket: report.ticket,
      status: report.status,
      resolvedAt: report.resolvedAt,
      responseCount: report.responseCount,
    };
  });
}
