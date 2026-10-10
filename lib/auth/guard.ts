import "server-only";

import { redirect } from "next/navigation";

import { DomainError } from "@/db/commands";
import { getActiveOfficer, getVillageProfile } from "@/db/queries";
import type { ActiveOfficer } from "@/db/queries";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import type { StaffRole } from "@/db/schema";
import { getCurrentActor, type CurrentActor, type ResidentActor, type StaffActor } from "./session";

export type Capability = keyof (typeof ROLE_CAPABILITIES)[StaffRole];

export function hasCapability(role: string, capability: Capability): boolean {
  const caps = ROLE_CAPABILITIES[role as StaffRole];
  return Boolean(caps?.[capability]);
}

export async function requireStaffSession(): Promise<StaffActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new DomainError("Sesi tidak ditemukan atau telah berakhir. Silakan masuk kembali.", "UNAUTHENTICATED", 401);
  }
  if (actor.type !== "STAFF") {
    throw new DomainError("Akses ini khusus petugas desa. Gunakan portal warga untuk layanan pribadi.", "FORBIDDEN_ACTOR", 403);
  }
  return actor;
}

export async function requireStaffOfficer(): Promise<StaffActor & { officer: ActiveOfficer }> {
  const actor = await requireStaffSession();
  const officer = await getActiveOfficer(actor.staff.villageId);
  if (!officer) {
    throw new DomainError("Sesi petugas tidak valid. Silakan masuk kembali.", "UNAUTHENTICATED", 401);
  }
  return { ...actor, officer };
}

export async function requireStaffCapability(capability: Capability): Promise<StaffActor & { officer: ActiveOfficer }> {
  const actor = await requireStaffOfficer();
  if (!hasCapability(actor.staff.role, capability)) {
    throw new DomainError("Peran Anda tidak memiliki kewenangan untuk tindakan ini.", "FORBIDDEN_CAPABILITY", 403);
  }
  return actor;
}

export async function requireResidentSession(): Promise<ResidentActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new DomainError("Sesi tidak ditemukan atau telah berakhir. Silakan masuk kembali.", "UNAUTHENTICATED", 401);
  }
  if (actor.type !== "RESIDENT") {
    throw new DomainError("Akses ini khusus warga melalui portal.", "FORBIDDEN_ACTOR", 403);
  }
  return actor;
}

export function loginRedirectTarget(actor: CurrentActor | null): string {
  if (actor?.type === "RESIDENT") return "/warga";
  return "/masuk";
}

export async function requireStaffPage(nextPath?: string): Promise<StaffActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    const target = nextPath ? `/masuk?next=${encodeURIComponent(nextPath)}` : "/masuk";
    redirect(target);
  }
  if (actor.type !== "STAFF") {
    redirect("/warga");
  }
  return actor;
}

export async function requireStaffPageWithCapability(
  capability: Capability,
  nextPath: string,
): Promise<StaffActor> {
  const actor = await requireStaffPage(nextPath);
  if (!hasCapability(actor.staff.role, capability)) {
    redirect("/");
  }
  return actor;
}

export async function requireResidentPage(nextPath = "/warga"): Promise<ResidentActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect(`/warga/masuk?next=${encodeURIComponent(nextPath)}`);
  }
  if (actor.type !== "RESIDENT") {
    redirect("/");
  }
  return actor;
}

export async function redirectIfAuthenticated(): Promise<void> {
  const actor = await getCurrentActor();
  if (actor?.type === "STAFF") redirect("/");
  if (actor?.type === "RESIDENT") redirect("/warga");
}

export async function assertVillageSeeded(): Promise<{ id: string }> {
  const village = await getVillageProfile();
  if (!village) {
    throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
  }
  return { id: village.id };
}