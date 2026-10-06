"use client";

import {
  BadgeCheck,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Separator } from "@/components/ui/primitives";
import { ROLE_CAPABILITIES, STAFF_ROLE } from "@/lib/domain";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActiveOfficer } from "@/db/queries";
import type { StaffRole } from "@/db/schema";
import {
  errorMessage,
  errorFields,
  useActivateEsignPassphraseMutation,
} from "@/store/api";
import { toastFromMutation } from "./feedback";
import { useAppDispatch } from "@/store";

const CAPABILITY_LABEL: Record<string, string> = {
  verify: "Verifikasi berkas",
  sign: "Tanda tangan surat",
  publish: "Publikasi pengumuman",
  manageRegistry: "Kelola data kependudukan",
  manageSettings: "Pengaturan desa",
};

/**
 * "Profil & Hak Akses".
 *
 * Shows the officer exactly who the system thinks they are (identity from the
 * session, not the shift table) and, for the signer, hosts the self-service
 * "Aktivasi Sertifikat Tanda Tangan" — the only way a passphrase gets set in
 * production, done by the signer personally while logged in.
 */
export function OfficerProfileDialog({
  officer,
  open,
  onOpenChange,
}: {
  officer: ActiveOfficer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const role = officer.role as StaffRole;
  const capabilities = ROLE_CAPABILITIES[role] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="profil-officer-title"
        describedBy="profil-officer-desc"
        className="max-w-md"
      >
        <div className="mb-4 flex items-start gap-2.5 pr-6">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <h2
              id="profil-officer-title"
              className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
            >
              Profil &amp; Hak Akses
            </h2>
            <p id="profil-officer-desc" className="mt-0.5 text-2xs leading-4 text-fg-subtle">
              Identitas sesi Anda saat ini beserta kewenangan peran.
            </p>
          </div>
        </div>

        <dl className="space-y-2.5">
          <ProfileRow term="Nama" detail={officer.fullName} />
          <ProfileRow term="Jabatan" detail={officer.jobTitle} />
          <ProfileRow
            term="Peran sistem"
            detail={STAFF_ROLE[role] ?? officer.role}
          />
          {officer.nipd ? <ProfileRow term="NIPD" detail={officer.nipd} mono /> : null}
          <ProfileRow term="Email" detail={officer.email} />
          <ProfileRow
            term="Shift"
            detail={
              officer.shiftStartedAt
                ? `Aktif sejak ${formatClock(officer.shiftStartedAt)} WIB · ${officer.shiftStation ?? "Loket Pelayanan"}`
                : "Belum absen"
            }
          />
        </dl>

        <Separator className="my-4" />

        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            Hak akses
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {capabilities
              ? Object.entries(capabilities)
                  .filter(([, granted]) => granted)
                  .map(([capability]) => (
                    <li key={capability}>
                      <Badge variant="outline" size="sm">
                        {CAPABILITY_LABEL[capability] ?? capability}
                      </Badge>
                    </li>
                  ))
              : (
                  <li className="text-2xs text-fg-subtle">Peran tidak dikenal.</li>
                )}
            {capabilities && Object.values(capabilities).every((granted) => !granted) ? (
              <li className="text-2xs text-fg-subtle">
                Tidak ada kewenangan khusus untuk peran ini.
              </li>
            ) : null}
          </ul>
        </div>

        {officer.canSign ? (
          <>
            <Separator className="my-4" />
            <EsignActivationSection officer={officer} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileRow({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        {term}
      </dt>
      <dd
        className={cn("min-w-0 truncate text-right text-xs font-medium text-fg", mono && "tnum font-mono")}
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EsignActivationSection({ officer }: { officer: ActiveOfficer }) {
  const dispatch = useAppDispatch();
  const [activate, activateState] = useActivateEsignPassphraseMutation();
  const [currentPassphrase, setCurrentPassphrase] = React.useState("");
  const [newPassphrase, setNewPassphrase] = React.useState("");
  const [confirmPassphrase, setConfirmPassphrase] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const rotating = officer.signatureActivated;
  const fieldErrors = errorFields(activateState.error);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (newPassphrase !== confirmPassphrase) {
      setFormError("Konfirmasi frasa sandi tidak sama.");
      return;
    }

    try {
      const result = await activate({
        currentPassphrase: rotating && currentPassphrase ? currentPassphrase : undefined,
        newPassphrase,
      }).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: result.rotated
          ? "Frasa sandi sertifikat diperbarui"
          : "Sertifikat tanda tangan aktif",
        body: result.rotated
          ? "Gunakan frasa sandi baru pada upacara tanda tangan berikutnya."
          : "Anda kini dapat menandatangani surat dengan frasa sandi ini.",
      });
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmPassphrase("");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <section
      aria-labelledby="aktivasi-ttd-title"
      className="rounded-sm border border-civic/25 bg-civic-soft p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Stamp className="mt-0.5 size-4 shrink-0 text-civic" aria-hidden />
          <div>
            <h3 id="aktivasi-ttd-title" className="text-xs font-semibold text-fg">
              Sertifikat Tanda Tangan Elektronik
            </h3>
            <p className="mt-0.5 text-2xs leading-4 text-fg-muted">
              {rotating
                ? "Ganti frasa sandi kapan pun Anda memerlukannya."
                : "Aktivasikan frasa sandi pribadi untuk dapat menandatangani surat."}
            </p>
          </div>
        </div>
        <Badge variant={rotating ? "approved" : "pending"} size="sm">
          {rotating ? (
            <BadgeCheck className="size-3" aria-hidden />
          ) : (
            <CircleAlert className="size-3" aria-hidden />
          )}
          {rotating ? "Aktif" : "Belum aktif"}
        </Badge>
      </div>

      <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
        {rotating ? (
          <Field
            label="Frasa sandi saat ini"
            htmlFor="esign-current"
            required
            error={fieldErrors.currentPassphrase?.[0] ?? null}
          >
            <Input
              id="esign-current"
              type="password"
              autoComplete="current-password"
              value={currentPassphrase}
              onChange={(event) => setCurrentPassphrase(event.target.value)}
              placeholder="Minimal 8 karakter"
              required
            />
          </Field>
        ) : null}

        <Field
          label="Frasa sandi baru"
          htmlFor="esign-new"
          required
          error={fieldErrors.newPassphrase?.[0] ?? null}
          hint="Minimal 8 karakter. Frasa sandi disimpan hanya sebagai sidik scrypt."
        >
          <Input
            id="esign-new"
            type="password"
            autoComplete="new-password"
            value={newPassphrase}
            onChange={(event) => setNewPassphrase(event.target.value)}
            placeholder="Minimal 8 karakter"
            aria-invalid={Boolean(fieldErrors.newPassphrase)}
            required
          />
        </Field>

        <Field
          label="Ulangi frasa sandi baru"
          htmlFor="esign-confirm"
          required
          error={formError}
        >
          <Input
            id="esign-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassphrase}
            onChange={(event) => setConfirmPassphrase(event.target.value)}
            placeholder="Ketik ulang frasa sandi baru"
            required
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={activateState.isLoading || newPassphrase.length < 8 || confirmPassphrase.length < 8}
        >
          {activateState.isLoading ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <KeyRound aria-hidden />
          )}
          {rotating ? "Perbarui Frasa Sandi" : "Aktivasikan Sertifikat"}
        </Button>
      </form>
    </section>
  );
}
