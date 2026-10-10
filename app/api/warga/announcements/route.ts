import { DomainError, markResidentAnnouncementsRead } from "@/db/commands";
import { getVillageProfile, listResidentAnnouncements } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";
import {
  residentAnnouncementQuerySchema,
  residentAnnouncementReadSchema,
} from "@/lib/validators";

import { parseBody, parseSearchParams, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Resident notification feed, derived from the published announcements:
 * drafts and archived items never appear, and severity follows the priority
 * the officer chose when composing.
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const actor = await requireResidentSession();
    const query = parseSearchParams(residentAnnouncementQuerySchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const feed = await listResidentAnnouncements(village.id, actor.resident.id, {
      since: query.since ?? null,
      limit: query.limit,
    });

    return { ...feed, query };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const actor = await requireResidentSession();
    const body = await parseBody(residentAnnouncementReadSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const result = await markResidentAnnouncementsRead({
      villageId: village.id,
      residentId: actor.resident.id,
      announcementIds: body.ids,
    });

    return { ok: true, updated: result.updated };
  });
}
