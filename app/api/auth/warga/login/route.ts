import { appendAudit, DomainError } from "@/db/commands";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  clearResidentLoginFailures,
  createSession,
  findResidentAccountByNik,
  registerFailedResidentLogin,
  requestMeta,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  LOCKOUT_MS,
  MAX_LOGIN_ATTEMPTS,
  lockoutMinutesLeft,
  sanitizeRedirectPath,
} from "@/lib/auth/policy";
import { verifyPassword, burnDummyVerify } from "@/lib/auth/password";
import { getVillageProfile } from "@/db/queries";
import { residentLoginSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Resident (warga) login: NIK + password against `resident_accounts`.
 *
 * Accounts are issued at the counter after identity verification, so the NIK —
 * the one identifier printed on the KTP the village already trusts — is the
 * login name. Timing and messaging are identical for unknown NIK and wrong
 * password, exactly like the staff route.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const payload = await parseBody(residentLoginSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const account = await findResidentAccountByNik(payload.nik);
    const invalid = new DomainError(
      "NIK atau kata sandi tidak sesuai.",
      "INVALID_CREDENTIALS",
      401,
    );

    let resident: t.Resident | null = null;
    if (account) {
      const db = await getDb();
      [resident] = await db
        .select()
        .from(t.residents)
        .where(eq(t.residents.id, account.residentId))
        .limit(1);
    }

    if (!account || !account.active || !resident || resident.status !== "AKTIF") {
      burnDummyVerify(payload.password);
      throw invalid;
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      throw new DomainError(
        `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${lockoutMinutesLeft(account.lockedUntil)} menit.`,
        "ACCOUNT_LOCKED",
        429,
      );
    }

    if (!verifyPassword(payload.password, account.passwordHash)) {
      const state = await registerFailedResidentLogin(account);
      const initials = resident.fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
      await appendAudit(village.id, {
        kind: "KEAMANAN_AKUN",
        summary: state.locked
          ? `Akun portal warga ${resident.fullName} (NIK …${resident.nik.slice(-4)}) terkunci setelah ${state.attempts} percobaan masuk gagal.`
          : `Percobaan masuk portal warga gagal untuk NIK …${resident.nik.slice(-4)} — ${state.attempts}/${MAX_LOGIN_ATTEMPTS}.`,
        subjectType: "resident",
        subjectId: resident.id,
        actor: {
          id: null,
          name: resident.fullName,
          initials: initials || "W",
          role: "Warga (Portal)",
        },
        meta: { attempts: state.attempts, locked: state.locked, lockoutMinutes: Math.round(LOCKOUT_MS / 60_000) },
      });
      if (state.locked) {
        throw new DomainError(
          "NIK atau kata sandi tidak sesuai, dan akun kini terkunci sementara karena terlalu banyak percobaan gagal.",
          "ACCOUNT_LOCKED",
          429,
        );
      }
      throw invalid;
    }

    await clearResidentLoginFailures(account.id);

    const meta = requestMeta(request);
    const session = await createSession({
      actorType: "RESIDENT",
      actorId: account.id,
      villageId: village.id,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    const initials = resident.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
    await appendAudit(village.id, {
      kind: "MASUK_LOG",
      summary: `${resident.fullName} masuk ke portal warga.`,
      subjectType: "resident",
      subjectId: resident.id,
      actor: {
        id: null,
        name: resident.fullName,
        initials: initials || "W",
        role: "Warga (Portal)",
      },
      meta: { sessionId: session.id },
    });

    await setSessionCookie(session.id);

    return {
      ok: true as const,
      resident: { fullName: resident.fullName },
      redirectTo: sanitizeRedirectPath(payload.next, "/warga"),
    };
  });
}
