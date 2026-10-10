import { appendAudit, DomainError, openStaffShift } from "@/db/commands";
import {
  clearStaffLoginFailures,
  createSession,
  findStaffByEmail,
  registerFailedStaffLogin,
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
import { staffLoginSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const payload = await parseBody(staffLoginSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const staff = await findStaffByEmail(payload.email);
    const invalid = new DomainError(
      "Email atau kata sandi tidak sesuai.",
      "INVALID_CREDENTIALS",
      401,
    );

    // Same work for unknown emails and wrong passwords, so timing cannot
    // reveal which one failed. No account-enumeration messages either.
    if (!staff || !staff.active || !staff.passwordHash) {
      burnDummyVerify(payload.password);
      throw invalid;
    }

    if (staff.loginLockedUntil && staff.loginLockedUntil.getTime() > Date.now()) {
      throw new DomainError(
        `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${lockoutMinutesLeft(staff.loginLockedUntil)} menit atau hubungi administrator desa.`,
        "ACCOUNT_LOCKED",
        429,
      );
    }

    if (!verifyPassword(payload.password, staff.passwordHash)) {
      const state = await registerFailedStaffLogin(staff);
      await appendAudit(village.id, {
        kind: "KEAMANAN_AKUN",
        summary: state.locked
          ? `Akun ${staff.fullName} (${staff.email}) terkunci setelah ${state.attempts} percobaan masuk gagal.`
          : `Percobaan masuk gagal untuk ${staff.fullName} (${staff.email}) — ${state.attempts}/${MAX_LOGIN_ATTEMPTS}.`,
        subjectType: "staff",
        subjectId: staff.id,
        actor: {
          id: staff.id,
          name: staff.fullName,
          initials: staff.initials,
          role: staff.jobTitle,
        },
        meta: { attempts: state.attempts, locked: state.locked, lockoutMinutes: Math.round(LOCKOUT_MS / 60_000) },
      });
      if (state.locked) {
        throw new DomainError(
          "Email atau kata sandi tidak sesuai, dan akun kini terkunci sementara karena terlalu banyak percobaan gagal.",
          "ACCOUNT_LOCKED",
          429,
        );
      }
      throw invalid;
    }

    await clearStaffLoginFailures(staff.id);

    const meta = requestMeta(request);
    const session = await createSession({
      actorType: "STAFF",
      actorId: staff.id,
      villageId: village.id,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    const shift = await openStaffShift({
      staffId: staff.id,
      station: payload.station,
      ipAddress: meta.ipAddress,
    });

    await appendAudit(village.id, {
      kind: "MASUK_LOG",
      summary: shift.reopened
        ? `${staff.fullName} masuk dan memulai shift di ${payload.station}.`
        : `${staff.fullName} masuk; shift di ${payload.station} sudah berjalan.`,
      subjectType: "staff",
      subjectId: staff.id,
      actor: {
        id: staff.id,
        name: staff.fullName,
        initials: staff.initials,
        role: staff.jobTitle,
      },
      meta: { station: payload.station, sessionId: session.id, shiftStarted: shift.reopened },
    });

    await setSessionCookie(session.id);

    return {
      ok: true as const,
      officer: {
        id: staff.id,
        fullName: staff.fullName,
        jobTitle: staff.jobTitle,
        role: staff.role,
      },
      redirectTo: sanitizeRedirectPath(payload.next, "/"),
    };
  });
}