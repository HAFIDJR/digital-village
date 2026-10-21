"use client";

import {
  CircleAlert,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/primitives";
import { formatNik } from "@/lib/format";
import {
  residentAccountDraftSchema,
  residentAccountResetSchema,
} from "@/lib/validators";
import {
  errorFields,
  errorMessage,
  useCreateResidentAccountMutation,
  useResetResidentAccountPasswordMutation,
  useSetResidentAccountActiveMutation,
} from "@/store/api";
import { useAppDispatch } from "@/store";

import { toastFromMutation } from "../feedback";

export type ResidentAccountTarget = {
  id: string;
  nik: string;
  fullName: string;
  hasAccount: boolean;
  accountActive: boolean | null;
};

function collectIssues(error: unknown) {
  const fieldErrors: Record<string, string[]> = {};
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
  for (const issue of issues ?? []) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

/**
 * Dual-mode account dialog. Without an account it provisions one (password +
 * confirmation). With an account it becomes the management panel: a Switch
 * that deactivates/reactivates the login — deactivation revokes live sessions
 * immediately — and an optional password reset. Both actions are audited as
 * security events; the password itself is never recorded.
 */
export function ResidentAccountDialog({
  resident,
  open,
  onOpenChange,
}: {
  resident: ResidentAccountTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const [createAccount, createState] = useCreateResidentAccountMutation();
  const [resetPassword, resetState] = useResetResidentAccountPasswordMutation();
  const [setActive, activeState] = useSetResidentAccountActiveMutation();

  // The workspace remounts this dialog (via `key`) for every resident, so the
  // fields always start empty — no re-seeding effect needed.
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const manageMode = Boolean(resident?.hasAccount);
  const isActive = resident?.accountActive !== false;

  const pending =
    createState.isLoading || resetState.isLoading || activeState.isLoading;

  const toggleActive = async (next: boolean) => {
    if (!resident) return;
    setErrors({});
    try {
      await setActive({ residentId: resident.id, active: next }).unwrap();
      toastFromMutation(dispatch, {
        tone: next ? "success" : "warning",
        title: next ? "Akun portal diaktifkan" : "Akun portal dinonaktifkan",
        body: next
          ? `${resident.fullName} dapat masuk kembali ke portal warga.`
          : `Sesi aktif ${resident.fullName} diputus dan portal menolak masuk dengan NIK ${formatNik(resident.nik)}.`,
      });
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resident) return;
    setErrors({});

    if (password !== confirmation) {
      setErrors({ confirmation: ["Konfirmasi kata sandi tidak sama."] });
      return;
    }

    if (manageMode) {
      const parsed = residentAccountResetSchema.safeParse({
        residentId: resident.id,
        password,
      });
      if (!parsed.success) {
        setErrors(collectIssues(parsed.error));
        return;
      }
      try {
        const result = await resetPassword(parsed.data).unwrap();
        toastFromMutation(dispatch, {
          tone: "success",
          title: "Kata sandi akun warga direset",
          body: `Kata sandi portal ${resident.fullName} diperbarui${result.account.sessionsRevoked ? ` dan ${result.account.sessionsRevoked} sesi lama diputus` : ""}. Sampaikan kata sandi baru secara langsung.`,
        });
        setPassword("");
        setConfirmation("");
      } catch (error) {
        setErrors(errorFields(error));
      }
      return;
    }

    const parsed = residentAccountDraftSchema.safeParse({
      residentId: resident.id,
      password,
    });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }

    try {
      const result = await createAccount(parsed.data).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Akun portal warga dibuat",
        body: `${resident.fullName} dapat masuk ke portal dengan NIK ${result.account.nik}.`,
      });
      onOpenChange(false);
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const errorState = manageMode
    ? resetState.isError
      ? resetState
      : activeState
    : createState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="account-form-title"
        describedBy="account-form-desc"
        className="max-w-md"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
              {manageMode ? (
                <UserCog className="size-4" aria-hidden />
              ) : (
                <KeyRound className="size-4" aria-hidden />
              )}
            </span>
            <div>
              <h2
                id="account-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                {manageMode ? "Kelola Akun Warga" : "Buat Akun Warga"}
              </h2>
              <p
                id="account-form-desc"
                className="mt-0.5 text-2xs leading-4 text-fg-subtle"
              >
                {manageMode
                  ? "Nonaktifkan akun bila warga kehilangan akses atau datanya bermasalah, atau reset kata sandi dan sampaikan yang baru secara langsung."
                  : "Akun dipakai warga untuk masuk ke portal dengan NIK dan kata sandi. Sampaikan kata sandi awal secara langsung kepada yang bersangkutan."}
              </p>
            </div>
          </div>

          {resident ? (
            <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-sm border border-line bg-surface-muted px-2.5 py-2 text-2xs">
              <dt className="text-fg-subtle">Nama</dt>
              <dd className="font-medium text-fg">{resident.fullName}</dd>
              <dt className="text-fg-subtle">NIK (username)</dt>
              <dd className="tnum font-mono text-fg">{formatNik(resident.nik)}</dd>
              {manageMode ? (
                <>
                  <dt className="text-fg-subtle">Status akun</dt>
                  <dd className="font-medium text-fg">
                    {isActive ? "Aktif" : "Nonaktif"}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {manageMode ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-line bg-surface px-2.5 py-2">
              <span className="text-2xs leading-4 text-fg-muted">
                <span className="block text-xs font-medium text-fg">
                  Akun portal aktif
                </span>
                Mematikan saklar langsung memutus sesi yang sedang berjalan.
              </span>
              <Switch
                checked={isActive}
                disabled={activeState.isLoading}
                onCheckedChange={(value) => void toggleActive(value)}
                aria-label={`Aktifkan atau nonaktifkan akun portal ${resident?.fullName ?? ""}`}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <Field
              label={manageMode ? "Kata sandi baru" : "Kata sandi awal"}
              htmlFor="account-password"
              required
              error={errors.password?.[0]}
              hint={
                manageMode
                  ? "Minimal 8 karakter. Sesi lama diputus setelah reset."
                  : "Minimal 8 karakter. Warga sebaiknya menggantinya setelah masuk pertama kali."
              }
            >
              <Input
                id="account-password"
                type="password"
                value={password}
                maxLength={128}
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(errors.password)}
              />
            </Field>

            <Field
              label="Ulangi kata sandi"
              htmlFor="account-confirmation"
              required
              error={errors.confirmation?.[0]}
            >
              <Input
                id="account-confirmation"
                type="password"
                value={confirmation}
                maxLength={128}
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={Boolean(errors.confirmation)}
              />
            </Field>
          </div>

          <p className="mt-3 flex items-start gap-1.5 rounded-sm border border-pending-line/60 bg-pending-bg px-2.5 py-2 text-2xs text-pending">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
            {manageMode
              ? "Reset kata sandi dan perubahan status akun dicatat pada jejak audit desa sebagai peristiwa keamanan."
              : "Pembuatan akun dicatat pada jejak audit desa sebagai peristiwa keamanan akun."}
          </p>

          {errors._form?.length || errorState.isError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form?.[0] ?? errorMessage(errorState.error)}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {manageMode ? "Tutup" : "Batal"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={pending || !resident || !password || !confirmation}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <KeyRound aria-hidden />
              )}
              {manageMode ? "Reset kata sandi" : "Buat akun"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
