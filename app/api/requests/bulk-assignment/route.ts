import { bulkAssignRequests } from "@/db/commands";
import { listStaff } from "@/db/queries";
import { hasCapability, requireStaffCapability } from "@/lib/auth/guard";
import { bulkAssignmentSchema } from "@/lib/validators";
import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    const { staff } = await requireStaffCapability("verify");
    const eligible = (await listStaff(staff.villageId))
      .filter((member) => member.active && hasCapability(member.role, "verify"))
      .map(({ id, fullName, jobTitle }) => ({ id, fullName, jobTitle }));
    return { staff: eligible };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const { staff } = await requireStaffCapability("verify");
    const payload = await parseBody(bulkAssignmentSchema, request);
    const results = await bulkAssignRequests({ villageId: staff.villageId, actorId: staff.id, ...payload });
    return { results };
  });
}
