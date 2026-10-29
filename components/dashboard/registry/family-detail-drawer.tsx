"use client";

import { CircleAlert, IdCard, PencilLine, Trash2, Users } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/primitives";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FamilyDetail } from "@/db/queries";
import { GENDER_LABEL, RESIDENT_STATUS, TONE_CLASSES, welfareTone } from "@/lib/domain";
import { ageFrom, formatDate, formatKk, formatNik } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetFamilyDetailQuery } from "@/store/api";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle">
        {label}
      </span>
      <span className="text-xs text-fg">{value}</span>
    </div>
  );
}

/**
 * Read model of one Kartu Keluarga — header facts plus the member list.
 * Edit and delete live here so the destructive actions sit next to the data
 * they affect; both bubble up to the workspace dialogs.
 */
export function FamilyDetailDrawer({
  familyId,
  onClose,
  onEdit,
  onDelete,
  canManage,
}: {
  familyId: string | null;
  onClose: () => void;
  onEdit: (family: FamilyDetail) => void;
  onDelete: (family: FamilyDetail) => void;
  canManage: boolean;
}) {
  const { data, isLoading, isError, error } = useGetFamilyDetailQuery(
    familyId ?? "",
    { skip: !familyId },
  );
  const family = data?.family ?? null;

  return (
    <Sheet open={Boolean(familyId)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="flex w-full flex-col sm:max-w-[min(38rem,94vw)]"
        labelledBy="judul-detail-kk"
        description="deskripsi-detail-kk"
        aria-label="Detail kartu keluarga"
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-2xs text-fg-subtle">
            <span role="status" className="flex items-center gap-2">
              <span className="sr-only">Memuat kartu keluarga…</span>
              Memuat kartu keluarga…
            </span>
          </div>
        ) : isError || !family ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <CircleAlert className="size-5 text-rejected" aria-hidden />
            <p className="text-xs font-medium text-fg">
              Kartu keluarga tidak dapat dimuat
            </p>
            <p className="text-2xs text-fg-subtle">{errorMessage(error)}</p>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        ) : (
          <>
            <header className="border-b border-line bg-surface px-4 py-3 pr-12">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="tnum font-mono text-xs font-semibold tracking-tight text-fg">
                  {formatKk(family.kkNumber)}
                </span>
                <Badge variant="outline" size="sm" className={cn(TONE_CLASSES[welfareTone(family.welfareClass)].chip)}>
                  {family.welfareClass ?? "Belum diklasifikasi"}
                </Badge>
                <Badge variant="neutral" size="sm">
                  {family.memberCount} anggota
                </Badge>
              </div>
              <SheetTitle
                id="judul-detail-kk"
                className="mt-1 font-display text-base font-bold tracking-[-0.01em] text-fg"
              >
                {family.headName}
              </SheetTitle>
              <SheetDescription id="deskripsi-detail-kk" className="mt-0.5 text-2xs text-fg-subtle">
                {family.dusun} · RT {String(family.rt).padStart(2, "0")}/RW{" "}
                {String(family.rw).padStart(2, "0")}
              </SheetDescription>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <section aria-label="Data kartu keluarga">
                <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <IdCard className="size-3.5" aria-hidden />
                  Data Kartu Keluarga
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-sm border border-line bg-surface-muted px-3 py-2.5">
                  <Fact
                    label="NIK kepala keluarga"
                    value={
                      family.headNik ? (
                        <span className="tnum font-mono">{formatNik(family.headNik)}</span>
                      ) : (
                        "Belum tercatat"
                      )
                    }
                  />
                  <Fact
                    label="Klasifikasi kesejahteraan"
                    value={family.welfareClass ?? "Belum diklasifikasi"}
                  />
                  <Fact
                    label="Wilayah"
                    value={`${family.hamletName.split(" - ")[0]} · RT ${String(family.rt).padStart(2, "0")}/RW ${String(family.rw).padStart(2, "0")}`}
                  />
                  <Fact label="Terdaftar sejak" value={<span className="tnum">{formatDate(family.createdAt)}</span>} />
                  <div className="col-span-2">
                    <Fact label="Alamat" value={family.address} />
                  </div>
                </div>
              </section>

              <Separator className="my-3" />

              <section aria-label="Anggota kartu keluarga">
                <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <Users className="size-3.5" aria-hidden />
                  Anggota ({family.members.length})
                </h3>

                {family.members.length === 0 ? (
                  <p className="mt-2 rounded-sm border border-line bg-surface-muted px-3 py-2.5 text-2xs text-fg-subtle">
                    Belum ada anggota terdaftar pada kartu keluarga ini.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {family.members.map((member) => {
                      const statusMeta = RESIDENT_STATUS[member.status] ?? {
                        label: member.status,
                        tone: "neutral" as const,
                      };
                      return (
                        <li
                          key={member.id}
                          className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface px-2.5 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-fg">
                              {member.fullName}
                            </span>
                            <span className="tnum block font-mono text-[10px] text-fg-subtle">
                              {formatNik(member.nik)} ·{" "}
                              {GENDER_LABEL[member.gender] ?? member.gender} ·{" "}
                              {ageFrom(member.birthDate, new Date())} thn ·{" "}
                              {member.relationLabel ?? "—"}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            size="sm"
                            className={cn("shrink-0", TONE_CLASSES[statusMeta.tone].chip)}
                          >
                            {statusMeta.label}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <p className="mt-3 text-[10px] leading-4 text-fg-subtle">
                Terakhir diperbarui <span className="tnum">{formatDate(family.updatedAt)}</span>.
                Menghapus kartu keluarga tidak menghapus data penduduk — anggota
                dilepas dan kembali tercatat tanpa nomor KK.
              </p>
            </div>

            {canManage ? (
              <footer className="flex items-center justify-end gap-1.5 border-t border-line bg-surface-muted px-4 py-2.5">
                <Button variant="outline" size="sm" onClick={() => onEdit(family)}>
                  <PencilLine aria-hidden />
                  Ubah KK
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(family)}
                >
                  <Trash2 aria-hidden />
                  Hapus KK
                </Button>
              </footer>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}