"use client";

import { Clock3, MapPin, MessageSquare, Phone, Printer, ShieldCheck, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/primitives";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PRIORITY, REPORT_CATEGORY, REPORT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatDateTime, formatNik, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/db/queries";

import { useNow } from "../now-context";

/**
 * Report detail slide-over.
 *
 * Rendered from the row already in the table rather than a second fetch: the
 * register returns the full report body, and opening a drawer that then spins
 * for half a second while the officer is reading the row underneath is worse
 * than the few bytes it saves.
 */
export function ReportDrawer({
  report,
  onClose,
}: {
  report: ReportRow | null;
  onClose: () => void;
}) {
  const now = useNow();
  const statusMeta = report ? (REPORT_STATUS[report.status] ?? { label: report.status, tone: "neutral" as const }) : null;

  return (
    <Sheet open={Boolean(report)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="flex w-full flex-col sm:max-w-[min(38rem,94vw)]"
        labelledBy="judul-detail-laporan"
        description="detail-laporan-warga"
        aria-label="Detail laporan warga"
      >
        {report ? (
          <>
            <header className="border-b border-line bg-surface px-4 py-3 pr-12">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
                  {report.ticket}
                </span>
                {statusMeta ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className={cn(TONE_CLASSES[statusMeta.tone].chip)}
                  >
                    {statusMeta.label}
                  </Badge>
                ) : null}
                <Badge variant="neutral" size="sm">
                  {REPORT_CATEGORY[report.category] ?? report.category}
                </Badge>
                {report.priority !== "NORMAL" ? (
                  <Badge
                    variant={report.priority === "DARURAT" ? "rejected" : "pending"}
                    size="sm"
                  >
                    {PRIORITY[report.priority]?.label ?? report.priority}
                  </Badge>
                ) : null}
              </div>

              <SheetTitle
                id="judul-detail-laporan"
                className="mt-1.5 font-display text-sm font-bold leading-5 tracking-[-0.01em] text-fg"
              >
                {report.subject}
              </SheetTitle>
              <SheetDescription id="detail-laporan-warga" className="mt-0.5 text-2xs text-fg-subtle">
                Dilaporkan {formatRelative(report.submittedAt, now)} ·{" "}
                {formatDateTime(report.submittedAt)}
              </SheetDescription>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* --- reporter ------------------------------------------- */}
              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Data Pelapor
                </h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Field label="Nama lengkap" value={report.reporterName} />
                  <Field label="NIK" value={formatNik(report.reporterNik)} mono />
                  <Field
                    label="Nomor telepon"
                    value={report.reporterPhone ?? "—"}
                    icon={Phone}
                    mono
                  />
                  <Field
                    label="Wilayah"
                    value={`${report.dusun ?? "—"}${
                      report.rt !== null
                        ? ` · RT ${String(report.rt).padStart(2, "0")}/RW ${String(
                            report.rw,
                          ).padStart(2, "0")}`
                        : ""
                    }`}
                    icon={MapPin}
                  />
                </dl>
              </section>

              <Separator />

              {/* --- body ----------------------------------------------- */}
              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Isi Laporan
                </h3>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-fg-muted">
                  {report.body}
                </p>
              </section>

              <Separator />

              {/* --- handling ------------------------------------------- */}
              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Penanganan
                </h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Field
                    label="Petugas penanggung jawab"
                    value={report.handledByName?.replace(/,.*$/, "") ?? "Belum ditugaskan"}
                    icon={UserCheck}
                    tone={report.handledByName ? "neutral" : "pending"}
                  />
                  <Field
                    label="Tanggapan terkirim"
                    value={`${report.responseCount} tanggapan`}
                    icon={MessageSquare}
                  />
                  <Field
                    label="Lama terbuka"
                    value={
                      report.resolvedAt
                        ? `Selesai ${formatRelative(report.resolvedAt, now)}`
                        : `${report.openDays} hari`
                    }
                    icon={Clock3}
                  />
                  <Field
                    label="Batas tanggapan"
                    value="5 hari kerja (Perdes Pelayanan Publik)"
                    icon={ShieldCheck}
                  />
                </dl>

                <p className="mt-3 rounded-sm border border-line bg-surface-muted px-3 py-2 text-[10px] leading-4 text-fg-subtle">
                  Tanggapan resmi kepada warga dikirim melalui modul Kanal Pengaduan dan otomatis
                  tercatat pada jejak audit desa. Panel ini menampilkan data yang diterima operator
                  tanpa mengubah isi laporan.
                </p>
              </section>
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-4 py-2.5">
              <p className="text-[10px] text-fg-subtle">
                Tiket {report.ticket} · arsip laporan desa
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                >
                  <Printer aria-hidden />
                  Cetak Laporan
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>
                  Tutup
                </Button>
              </div>
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  icon: Icon,
  mono,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  mono?: boolean;
  tone?: "neutral" | "pending";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.05em] text-fg-subtle">
        {Icon ? <Icon className="size-2.5" aria-hidden /> : null}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-xs",
          mono && "font-mono tabular-nums",
          tone === "pending" ? TONE_CLASSES.pending.text : "text-fg",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
