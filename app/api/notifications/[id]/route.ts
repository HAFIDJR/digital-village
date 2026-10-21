import { DomainError, markNotificationRead } from "@/db/commands";
import { getNotificationDetail, getVillageProfile } from "@/db/queries";
import { requireStaffOfficer } from "@/lib/auth/guard";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** One notification with its resolved subject — the topbar detail sheet. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/notifications/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffOfficer();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const notification = await getNotificationDetail(village.id, officer.id, id);
    if (!notification) {
      throw new DomainError("Notifikasi tidak ditemukan.", "NOTIFICATION_NOT_FOUND", 404);
    }

    return { ok: true, notification };
  });
}

/** Marks one notification as read for the current officer. */
export async function PATCH(
  _request: Request,
  ctx: RouteContext<"/api/notifications/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffOfficer();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const result = await markNotificationRead(village.id, officer.id, id);

    return { ok: true, id, updated: result.updated };
  });
}
