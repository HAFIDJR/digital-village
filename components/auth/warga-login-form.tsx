"use client";

import { CircleAlert, LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { sanitizeRedirectPath } from "@/lib/auth/policy";
import { errorMessage, errorFields, useWargaLoginMutation } from "@/store/api";

/** Resident (warga) portal login — NIK + password. */
export function WargaLoginForm({
  nextPath,
  devCredentials,
}: {
  nextPath: string;
  /** Dev-only demo credentials; only ever passed outside production. */
  devCredentials: { nik: string; password: string } | null;
}) {
  const [login, loginState] = useWargaLoginMutation();
  const [nik, setNik] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const fieldErrors = errorFields(loginState.error);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      const result = await login({ nik, password, next: nextPath }).unwrap();
      window.location.assign(sanitizeRedirectPath(result.redirectTo, "/warga"));
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="NIK"
        htmlFor="nik"
        required
        error={fieldErrors.nik?.[0] ?? null}
        hint="16 digit Nomor Induk Kependudukan sesuai KTP."
      >
        <Input
          id="nik"
          name="nik"
          inputMode="numeric"
          autoComplete="username"
          value={nik}
          onChange={(event) => setNik(event.target.value.replace(/\D/g, "").slice(0, 16))}
          placeholder="320416…"
          className="tnum font-mono"
          aria-invalid={Boolean(fieldErrors.nik)}
          required
        />
      </Field>

      <Field
        label="Kata sandi"
        htmlFor="password"
        required
        error={fieldErrors.password?.[0] ?? null}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Kata sandi dari loket desa"
          aria-invalid={Boolean(fieldErrors.password)}
          required
        />
      </Field>

      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-sm border border-rejected-line/70 bg-rejected-bg px-2.5 py-2 text-2xs leading-4 text-rejected"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loginState.isLoading}
      >
        {loginState.isLoading ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <LogIn aria-hidden />
        )}
        Masuk Portal Warga
      </Button>

      {devCredentials ? (
        <div className="rounded-sm border border-pending-line/60 bg-pending-bg px-2.5 py-2">
          <p className="text-2xs font-semibold text-pending">Lingkungan latihan</p>
          <p className="mt-0.5 text-2xs leading-4 text-pending/90">
            Akun demo: NIK{" "}
            <span className="tnum font-mono font-semibold">{devCredentials.nik}</span> · kata sandi{" "}
            <span className="font-mono font-semibold">{devCredentials.password}</span>
          </p>
          <button
            type="button"
            className="mt-1 text-2xs font-medium text-pending underline underline-offset-2"
            onClick={() => {
              setNik(devCredentials.nik);
              setPassword(devCredentials.password);
            }}
          >
            Isi otomatis
          </button>
        </div>
      ) : null}

      <p className="text-2xs leading-4 text-fg-subtle">
        Belum punya akun? Datang ke loket pelayanan desa dengan KTP asli — petugas
        akan mengaktivasi akses portal untuk Anda.
      </p>
    </form>
  );
}