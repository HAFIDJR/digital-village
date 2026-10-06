import { appendAudit, closeOpenStaffShifts } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { clearSessionCookie, getCurrentActor, revokeSession } from "@/lib/auth/session";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Logout for both audiences. For staff it also closes every open shift row,
 * exactly what "Akhiri Shift & Keluar" promises. Revoking the session row
 * means the old cookie can never be replayed, even before it expires.
 */
export async function POST() {
  return withApi(async () => {
    const actor = await getCurrentActor();

    // Logging out without a session is a no-op success — the client ends up on
    // the login page either way, and a 401 here would just add noise.
    if (!actor) {
      await clearSessionCookie();
      return { ok: true as const, redirectTo: "/masuk" };
    }

    const village = await getVillageProfile();

    if (actor.type === "STAFF") {
      await closeOpenStaffShifts(actor.staff.id);
      if (village) {
        await appendAudit(village.id, {
          kind: "KELUAR_LOG",
          summary: `${actor.staff.fullName} mengakhiri shift dan keluar dari sistem.`,
          subjectType: "staff",
          subjectId: actor.staff.id,
          actor: {
            id: actor.staff.id,
            name: actor.staff.fullName,
            initials: actor.staff.initials,
            role: actor.staff.jobTitle,
          },
          meta: { sessionId: actor.session.id },
        });
      }
    } else if (village) {
      const initials = actor.resident.fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
      await appendAudit(village.id, {
        kind: "KELUAR_LOG",
        summary: `${actor.resident.fullName} keluar dari portal warga.`,
        subjectType: "resident",
        subjectId: actor.resident.id,
        actor: {
          id: null,
          name: actor.resident.fullName,
          initials: initials || "W",
          role: "Warga (Portal)",
        },
        meta: { sessionId: actor.session.id },
      });
    }

    await revokeSession(actor.session.id);
    await clearSessionCookie();

    return {
      ok: true as const,
      redirectTo: actor.type === "STAFF" ? "/masuk" : "/warga/masuk",
    };
  });
}
