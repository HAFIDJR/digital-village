"use client";

import { CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/primitives";
import { formatNik } from "@/lib/format";
import { residentAccountDraftSchema } from "@/lib/validators";
import {
  errorFields,
  errorMessage,
  useCreateResidentAccountMutation,
} from "@/store/api";
import { useAppDispatch } from "@/store";

import { toastFromMutation } from "../feedback";

export type ResidentAccountTarget = {
  id: string;
  nik: string;
  fullName: string;
};

/**
 * "Buat Akun Warga" — provisions the portal login. The password is hashed on the
 * server; the officer hands the initial credential to the resident offline.
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

  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resident) return;
    setErrors({});

    if (password !== confirmation) {
      setErrors({ confirmation: ["Konfirmasi kata sandi tidak sama."] });
      return;
    }

    const parsed = residentAccountDraftSchema.safeParse({
      residentId: resident.id,
      password,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_form";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      setErrors(fieldErrors);
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
              <KeyRound className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="account-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                Buat Akun Warga
              </h2>
              <p
                id="account-form-desc"
                className="mt-0.5 text-2xs leading-4 text-fg-subtle"
              >
                Akun dipakai warga untuk masuk ke portal dengan NIK dan kata
                sandi. Sampaikan kata sandi awal secara langsung kepada yang
                bersangkutan.
              </p>
            </div>
          </div>

          {resident ? (
            <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-sm border border-line bg-surface-muted px-2.5 py-2 text-2xs">
              <dt className="text-fg-subtle">Nama</dt>
              <dd className="font-medium text-fg">{resident.fullName}</dd>
              <dt className="text-fg-subtle">NIK (username)</dt>
              <dd className="tnum font-mono text-fg">{formatNik(resident.nik)}</dd>
            </dl>
          ) : null}

          <div className="space-y-3">
            <Field
              label="Kata sandi awal"
              htmlFor="account-password"
              required
              error={errors.password?.[0]}
              hint="Minimal 8 karakter. Warga sebaiknya menggantinya setelah masuk pertama kali."
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
            Pembuatan akun dicatat pada jejak audit desa sebagai peristiwa
            keamanan akun.
          </p>

          {errors._form?.length || createState.isError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form?.[0] ?? errorMessage(createState.error)}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createState.isLoading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={createState.isLoading || !resident}
            >
              {createState.isLoading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <KeyRound aria-hidden />
              )}
              Buat akun
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
