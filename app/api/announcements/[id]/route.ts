import {
  DomainError,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/db/commands";
import { getAnnouncement, getVillageProfile } from "@/db/queries";
import { hasCapability, requireStaffOfficer } from "@/lib/auth/guard";
import { announcementUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

function assertPublishCapability(role: string) {
  if (!hasCapability(role, "publish")) {
    throw new DomainError(
      "Jabatan Anda tidak berwenang mengubah pengumuman desa.",
      "FORBIDDEN_CAPABILITY",
      403,
    );
  }
}

/** The full announcement (body included) for the edit dialog. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/announcements/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffOfficer();
    assertPublishCapability(officer.role);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const announcement = await getAnnouncement(village.id, id);
    if (!announcement) {
      throw new DomainError("Pengumuman tidak ditemukan.", "ANNOUNCEMENT_NOT_FOUND", 404);
    }

    return { ok: true, announcement };
  });
}

/** Edits an announcement after posting — including a late status change. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/announcements/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const draft = await parseBody(announcementUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const { officer } = await requireStaffOfficer();
    assertPublishCapability(officer.role);

    const row = await updateAnnouncement({
      villageId: village.id,
      staffId: officer.id,
      announcementId: id,
      draft,
    });

    return {
      ok: true,
      announcement: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        channel: row.channel,
        priority: row.priority,
        pinned: row.pinned,
        publishAt: row.publishAt,
        expiresAt: row.expiresAt,
      },
    };
  });
}

/** Removes an announcement; deleting a published one notifies the officers. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/announcements/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const { officer } = await requireStaffOfficer();
    assertPublishCapability(officer.role);

    const deleted = await deleteAnnouncement({
      villageId: village.id,
      staffId: officer.id,
      announcementId: id,
    });

    return { ok: true, announcement: deleted };
  });
}
