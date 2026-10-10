import { verifyLetterRequest } from "@/db/commands";
import { requireStaffCapability } from "@/lib/auth/guard"
import { verifyRequestSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/requests/[id]/verify">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(verifyRequestSchema, request);

     const { officer, staff } = await requireStaffCapability("verify");

    const result = await verifyLetterRequest({
      villageId: staff.villageId,
      requestId: id,
      staffId: officer.id,
      payload,
    });

    return {
      ok: true,
      ticket: result.request.ticket,
      previousStatus: result.previousStatus,
      status: result.request.status,
      defectiveCount: result.defectiveCount,
      letterTypeName: result.letterTypeName,
    };
  });
}
