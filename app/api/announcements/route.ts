import { DomainError, publishAnnouncement } from "@/db/commands";
import { getActiveOfficer, getAnnouncements, getVillageProfile } from "@/db/queries";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import { announcementDraftSchema } from "@/lib/validators";
import type { StaffRole } from "@/db/schema";

import { parseBody, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/** Recent announcements, newest and pinned first. */
export async function GET() {
  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    return { announcements: await getAnnouncements(village.id, 8) };
  });
}

/**
 * Pushes a notice to the public website (or papan informasi / WA group).
 *
 * Authorisation is enforced from the role matrix in `lib/domain`, not from
 * whether the UI happened to render the button — the same capability table the
 * composer uses to decide what to show.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const draft = await parseBody(announcementDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const officer = await getActiveOfficer(village.id);
    if (!officer) {
      throw new DomainError("Tidak ada petugas aktif pada shift ini.", "NO_ACTIVE_STAFF", 409);
    }

    const capabilities = ROLE_CAPABILITIES[officer.role as StaffRole];
    if (!capabilities?.publish) {
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
