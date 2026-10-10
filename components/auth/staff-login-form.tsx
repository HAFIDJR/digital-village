"use client";

import { CircleAlert, LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { LOGIN_STATIONS, sanitizeRedirectPath } from "@/lib/auth/policy";
import { errorMessage, errorFields, useLoginMutation } from "@/store/api";
import { cn } from "@/lib/utils";

export function StaffLoginForm({
  nextPath,
  devCredentials,
}: {
  nextPath: string;
  devCredentials: { email: string; password: string } | null;
}) {
  const [login, loginState] = useLoginMutation();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [station, setStation] = React.useState<string>(LOGIN_STATIONS[0]);
  const [formError, setFormError] = React.useState<string | null>(null);

  const fieldErrors = errorFields(loginState.error);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      const result = await login({
        email,
        password,
        station,
        next: nextPath,
      }).unwrap();
      window.location.assign(sanitizeRedirectPath(result.redirectTo, "/"));
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Email instansi"
        htmlFor="email"
        required
        error={fieldErrors.email?.[0] ?? null}
        hint="Gunakan email resmi perangkat desa, mis. operator@sukamaju.desa.id."
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@sukamaju.desa.id"
          aria-invalid={Boolean(fieldErrors.email)}
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
          placeholder="Minimal 8 karakter"
          aria-invalid={Boolean(fieldErrors.password)}
          required
        />
      </Field>

      <Field
        label="Pos layanan"
        htmlFor="station"
        hint="Tercatat pada buku agenda digital sebagai titik absen shift Anda."
      >
        <select
          id="station"
          name="station"
          value={station}
          onChange={(event) => setStation(event.target.value)}
          className={cn(
            "h-8 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-xs text-fg",
            "transition-colors hover:border-slate-400",
            "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
          )}
        >
          {LOGIN_STATIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
        Masuk &amp; Mulai Shift
      </Button>

      {devCredentials ? (
        <div className="rounded-sm border border-pending-line/60 bg-pending-bg px-2.5 py-2">
          <p className="text-2xs font-semibold text-pending">Lingkungan latihan</p>
          <p className="mt-0.5 text-2xs leading-4 text-pending/90">
            Akun demo:{" "}
            <span className="font-mono font-semibold">{devCredentials.email}</span> · kata sandi{" "}
            <span className="font-mono font-semibold">{devCredentials.password}</span>
          </p>
          <button
            type="button"
            className="mt-1 text-2xs font-medium text-pending underline underline-offset-2"
            onClick={() => {
              setEmail(devCredentials.email);
              setPassword(devCredentials.password);
            }}
          >
            Isi otomatis
          </button>
        </div>
      ) : null}
    </form>
  );
}