import { z } from "zod";

import { markNotificationsRead } from "@/db/commands";
import { DomainError } from "@/db/commands";
import { getNotifications, getVillageProfile } from "@/db/queries";
import { requireStaffOfficer } from "@/lib/auth/guard";
import { uuidSchema } from "@/lib/validators";

import { parseBody, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  ids: z.array(uuidSchema).max(50).optional(),
});

// async function resolveContext() {
//   const village = await getVillageProfile();
//   if (!village)
//     throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
//   const officer = await getActiveOfficer(village.id);
//   return { village, officer };
// }

export async function GET() {
  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    const { officer } = await requireStaffOfficer();
    const rows = await getNotifications(village.id, officer?.id ?? null, 20);
    return {
      notifications: rows,
      unread: rows.filter((n) => n.readAt === null).length,
    };
  });
}

export function POST(request: Request) {
  return withApi(async () => {
    const { ids } = await parseBody(markReadSchema, request);
    const { officer } = await requireStaffOfficer();
    const village = await getVillageProfile();

    if (!village)
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const result = await markNotificationsRead(village.id, officer.id, ids);
    return { ok: true, updated: result.updated };
  });
}
