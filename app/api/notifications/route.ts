import { z } from "zod";

import { markNotificationsRead } from "@/db/commands";
import { DomainError } from "@/db/commands";
import { getActiveOfficer, getNotifications, getVillageProfile } from "@/db/queries";
import { uuidSchema } from "@/lib/validators";

import { parseBody, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  /** Omit to mark everything addressed to this officer as read. */
  ids: z.array(uuidSchema).max(50).optional(),
});

async function resolveContext() {
  const village = await getVillageProfile();
  if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
  const officer = await getActiveOfficer(village.id);
  return { village, officer };
}

export async function GET() {
  return withApi(async () => {
    const { village, officer } = await resolveContext();
    const rows = await getNotifications(village.id, officer?.id ?? null, 20);
    return {
      notifications: rows,
      unread: rows.filter((n) => n.readAt === null).length,
    };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const { ids } = await parseBody(markReadSchema, request);
    const { village, officer } = await resolveContext();

    if (!officer) {
      throw new DomainError("Tidak ada petugas aktif pada shift ini.", "NO_ACTIVE_STAFF", 409);
    }

    const result = await markNotificationsRead(village.id, officer.id, ids);
    return { ok: true, updated: result.updated };
  });
}
