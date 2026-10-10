import "server-only";

import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import type { Resident, ResidentAccount, Session, Staff } from "@/db/schema";
import {
  LOCKOUT_MS,
  MAX_LOGIN_ATTEMPTS,
  PRESENCE_THROTTLE_MS,
  SESSION_COOKIE,
  SESSION_RENEW_WINDOW_MS,
  SESSION_TTL_MS,
  lockoutMinutesLeft,
} from "@/lib/auth/policy";

export type StaffActor = {
  type: "STAFF";
  session: Session;
  staff: Staff;
};

export type ResidentActor = {
  type: "RESIDENT";
  session: Session;
  account: ResidentAccount;
  resident: Resident;
};

export type CurrentActor = StaffActor | ResidentActor;


export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}


export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function requestMeta(request: Request): { userAgent: string | null; ipAddress: string | null } {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
    ipAddress: forwarded?.split(",")[0]?.trim().slice(0, 64) ?? null,
  };
}

export async function createSession(input: {
  actorType: "STAFF" | "RESIDENT";
  actorId: string;
  villageId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<Session> {
  const db = await getDb();

  await db
    .delete(t.sessions)
    .where(lt(t.sessions.expiresAt, new Date(Date.now() - 24 * 3_600_000)));

  const [session] = await db
    .insert(t.sessions)
    .values({
      actorType: input.actorType,
      actorId: input.actorId,
      villageId: input.villageId,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning();
  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.sessions.id, sessionId), isNull(t.sessions.revokedAt)));
}

export async function getCurrentActor(): Promise<CurrentActor | null> {
  const sessionId = await getSessionId();
  if (!sessionId) return null;

  const db = await getDb();
  const [session] = await db
    .select()
    .from(t.sessions)
    .where(
      and(
        eq(t.sessions.id, sessionId),
        isNull(t.sessions.revokedAt),
        gt(t.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;

  
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < SESSION_RENEW_WINDOW_MS) {
    await db
      .update(t.sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS), lastSeenAt: new Date() })
      .where(eq(t.sessions.id, session.id));
  }

  if (session.actorType === "STAFF") {
    const [staff] = await db
      .select()
      .from(t.staff)
      .where(eq(t.staff.id, session.actorId))
      .limit(1);
    if (!staff || !staff.active) return null;

    if (!staff.lastSeenAt || Date.now() - staff.lastSeenAt.getTime() > PRESENCE_THROTTLE_MS) {
      await db
        .update(t.staff)
        .set({ lastSeenAt: new Date() })
        .where(eq(t.staff.id, staff.id));
    }
    return { type: "STAFF", session, staff };
  }

  const [account] = await db
    .select()
    .from(t.residentAccounts)
    .where(eq(t.residentAccounts.id, session.actorId))
    .limit(1);
  if (!account || !account.active) return null;

  const [resident] = await db
    .select()
    .from(t.residents)
    .where(eq(t.residents.id, account.residentId))
    .limit(1);
  if (!resident || resident.status !== "AKTIF") return null;

  return { type: "RESIDENT", session, account, resident };
}


type FailureState = { attempts: number; locked: boolean; lockedUntil: Date | null };

export async function registerFailedStaffLogin(staff: Staff): Promise<FailureState> {
  const db = await getDb();
  const attempts = (staff.loginAttempts ?? 0) + 1;
  const locked = attempts >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = locked ? new Date(Date.now() + LOCKOUT_MS) : null;
  await db
    .update(t.staff)
    .set({
      loginAttempts: attempts,
      ...(locked ? { loginLockedUntil: lockedUntil } : {}),
    })
    .where(eq(t.staff.id, staff.id));
  return { attempts, locked, lockedUntil };
}

export async function clearStaffLoginFailures(staffId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(t.staff)
    .set({ loginAttempts: 0, loginLockedUntil: null })
    .where(eq(t.staff.id, staffId));
}

export async function registerFailedResidentLogin(account: ResidentAccount): Promise<FailureState> {
  const db = await getDb();
  const attempts = (account.failedAttempts ?? 0) + 1;
  const locked = attempts >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = locked ? new Date(Date.now() + LOCKOUT_MS) : null;
  await db
    .update(t.residentAccounts)
    .set({
      failedAttempts: attempts,
      ...(locked ? { lockedUntil } : {}),
    })
    .where(eq(t.residentAccounts.id, account.id));
  return { attempts, locked, lockedUntil };
}

export async function clearResidentLoginFailures(accountId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(t.residentAccounts)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(t.residentAccounts.id, accountId));
}

export { lockoutMinutesLeft, MAX_LOGIN_ATTEMPTS };

export async function findStaffByEmail(email: string): Promise<Staff | null> {
  const db = await getDb();
  const [staff] = await db
    .select()
    .from(t.staff)
    .where(eq(sql`lower(${t.staff.email})`, email.trim().toLowerCase()))
    .limit(1);
  return staff ?? null;
}

export async function findResidentAccountByNik(nik: string): Promise<ResidentAccount | null> {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(t.residentAccounts)
    .where(eq(t.residentAccounts.nik, nik))
    .limit(1);
  return account ?? null;
}