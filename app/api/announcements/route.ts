import { DomainError, publishAnnouncement } from "@/db/commands";
import { getAnnouncements, getVillageProfile } from "@/db/queries";
import { hasCapability, requireStaffOfficer } from "@/lib/auth/guard";
import { announcementDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireStaffOfficer();

    const village = await getVillageProfile();
    if (!village)
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    return { announcements: await getAnnouncements(village.id, 8) };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const draft = await parseBody(announcementDraftSchema, request);
    const village = await getVillageProfile();
    if (!village)
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const { officer } = await requireStaffOfficer();

    if (!hasCapability(officer.role, "publish")) {
      throw new DomainError(
        "Jabatan Anda tidak berwenang menerbitkan pengumuman desa.",
        "FORBIDDEN",
        403,
      );
    }

    const row = await publishAnnouncement({
      villageId: village.id,
      staffId: officer.id,
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
        publishAt: row.publishAt,
      },
    };
  });
}