"use client";

import {
  ChevronDown,
  Download,
  FileText,
  Plus,
  QrCode,
  RefreshCw,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { REQUEST_STATUS } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  useListResidentRequestsQuery,
} from "@/store/api";

import { RequestComposer } from "./request-composer";

/**
 * "Pengajuan Surat" — the resident's own queue. Reads go through RTK Query, so
 * a status change made by an officer shows up on focus/reconnect and right
 * after the resident files a new letter.
 */
export function RequestPanel() {
  const requests = useListResidentRequestsQuery();
  const [composing, setComposing] = React.useState(false);

  const rows = requests.data?.requests ?? [];
  const downloadable = rows.filter((row) => row.downloadable).length;

  return (
    <section
      aria-labelledby="daftar-pengajuan"
      className="rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h2 id="daftar-pengajuan" className="text-xs font-semibold text-fg">
            Pengajuan Surat
          </h2>
          <p className="mt-0.5 text-2xs text-fg-subtle">
            {rows.length} total · {downloadable} siap diunduh
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requests.refetch()}
            disabled={requests.isFetching}
            aria-label="Segarkan daftar pengajuan"
          >
            <RefreshCw className={cn(requests.isFetching && "animate-spin")} aria-hidden />
            Segarkan
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setComposing((open) => !open)}
            aria-expanded={composing}
            aria-controls="form-ajukan-surat"
          >
            {composing ? <ChevronDown aria-hidden /> : <Plus aria-hidden />}
            {composing ? "Tutup formulir" : "Ajukan Surat"}
          </Button>
        </div>
      </div>

      {composing ? (
        <div id="form-ajukan-surat" className="border-b border-line">
          <RequestComposer />
        </div>
      ) : null}

      {requests.isError ? (
        <p role="alert" className="px-4 py-4 text-2xs text-rejected">
          {errorMessage(requests.error)}
        </p>
      ) : null}

      {requests.isLoading ? (
        <ul className="divide-y divide-line" aria-busy="true">
          {Array.from({ length: 2 }).map((_, index) => (
            <li key={index} className="px-4 py-3">
              <div className="h-3 w-40 rounded-sm bg-surface-muted" />
              <div className="mt-2 h-2.5 w-56 rounded-sm bg-surface-muted" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 && !composing ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-muted">
            <FileText className="size-4 text-fg-subtle" aria-hidden />
          </span>
          <p className="text-xs font-medium text-fg">Belum ada pengajuan surat</p>
          <p className="max-w-sm text-2xs leading-4 text-fg-subtle">
            Ajukan surat administrasi dari portal ini dengan menekan tombol
            “Ajukan Surat”, atau datang ke loket pelayanan balai desa dengan
            membawa KTP dan dokumen pendukung.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setComposing(true)}>
            <Plus aria-hidden />
            Ajukan surat sekarang
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((request) => {
            const status =
              REQUEST_STATUS[request.status as keyof typeof REQUEST_STATUS];
            return (
              <li key={request.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-fg">
                      {request.letterName}
                    </p>
                    <p className="tnum mt-0.5 font-mono text-2xs text-fg-subtle">
                      {request.ticket} · diajukan {formatDate(request.submittedAt)}
                    </p>
                    {request.purpose ? (
                      <p className="mt-1 max-w-md truncate text-2xs leading-4 text-fg-muted">
                        {request.purpose}
                      </p>
                    ) : null}
                    {status?.description ? (
                      <p className="mt-1 max-w-md text-[10px] leading-4 text-fg-subtle">
                        {status.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {status ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
                          status.tone === "approved"
                            ? "border-approved-line/70 bg-approved-bg text-approved"
                            : status.tone === "rejected"
                              ? "border-rejected-line/70 bg-rejected-bg text-rejected"
                              : status.tone === "progress"
                                ? "border-progress-line/70 bg-progress-bg text-progress"
                                : "border-pending-line/70 bg-pending-bg text-pending"
                        }`}
                      >
                        {status.label}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5">
                      {request.downloadable ? (
                        <a
                          href={`/api/warga/requests/${request.id}/pdf`}
                          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-civic bg-civic px-2.5 text-xs font-medium text-white transition-colors hover:bg-civic-hover"
                          download
                        >
                          <Download className="size-3.5" aria-hidden />
                          Unduh PDF
                        </a>
                      ) : null}
                      {request.certificateSerial ? (
                        <a
                          href={`/verifikasi/${request.verificationCode}`}
                          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-slate-400 hover:text-fg"
                        >
                          <QrCode className="size-3.5" aria-hidden />
                          Verifikasi
                        </a>
                      ) : null}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
