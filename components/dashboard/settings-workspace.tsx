"use client";

import { Building2, Clock3, KeyRound, Settings, ShieldCheck, Stamp, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { ROLE_CAPABILITIES, STAFF_ROLE, TONE_CLASSES } from "@/lib/domain";
import { formatClock, formatDate, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetShellQuery, useListStaffQuery } from "@/store/api";
import type { StaffRole } from "@/db/schema";

import { QueryErrorState } from "./feedback";
import { useNow } from "./now-context";
import {
  PageHeader,
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableEmpty,
  TableFrame,
  TableSkeleton,
} from "./page-kit";

/**
 * Pengaturan.
 *
 * Read-only by design. Village identity, the service catalogue and the staff
 * roster are governed data — an operator may look, but changing a dusun head or
 * a service SLA is a Sekdes/Kades action recorded elsewhere. Showing the values
 * without inventing write controls keeps the page honest instead of
 * decorative.
 */
export function SettingsWorkspace() {
  const now = useNow();
  const shell = useGetShellQuery();
  const staff = useListStaffQuery();

  const village = shell.data?.village;
  const officer = shell.data?.officer;
  const roster = staff.data?.staff ?? [];
  const letterTypes = staff.data?.letterTypes ?? [];
  const signers = roster.filter((member) => member.canSign);

  if (staff.isError) {
    return (
      <>
        <PageHeader eyebrow="Sistem" icon={Settings} title="Pengaturan" />
        <QueryErrorState
          title="Gagal memuat pengaturan desa"
          message={errorMessage(staff.error)}
          onRetry={() => staff.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Sistem · Konfigurasi Kantor"
        icon={Settings}
        title="Pengaturan & Konfigurasi Desa"
        description="Identitas pemerintah desa, sesi petugas yang sedang bertugas, hak akses perangkat desa, dan katalog layanan surat beserta tenggat pelayanannya."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(roster.length)} perangkat desa · {formatNumber(letterTypes.length)} jenis
            layanan
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Sesi aktif"
          value={officer ? officer.initials : "—"}
          hint={
            officer
              ? `${officer.fullName} · ${STAFF_ROLE[officer.role as StaffRole] ?? officer.jobTitle}`
              : "Tidak ada petugas bertugas"
          }
          tone="approved"
          icon={Clock3}
        />
        <StatCard
          label="Penandatangan digital"
          value={formatNumber(signers.length)}
          unit="akun"
          hint="Pemegang kredensial e-sign BSrE yang aktif"
          tone="progress"
          icon={Stamp}
        />
        <StatCard
          label="Jenis layanan surat"
          value={formatNumber(letterTypes.length)}
          unit="layanan"
          hint="Terdaftar beserta persyaratan dan SLA-nya"
          icon={Building2}
        />
        <StatCard
          label="Rata-rata SLA"
          value={
            letterTypes.length
              ? formatNumber(
                  Math.round(
                    letterTypes.reduce((sum, type) => sum + type.slaDays, 0) / letterTypes.length,
                  ),
                )
              : "—"
          }
          unit="hari kerja"
          hint="Tenggat pelayanan rata-rata seluruh jenis surat"
          icon={ShieldCheck}
        />
      </StatStrip>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Identitas Pemerintah Desa"
            description="Basis kop surat, sertifikat digital, dan halaman publik desa."
            icon={Building2}
          />
          <dl className="grid gap-x-6 gap-y-3 px-3.5 py-3 sm:grid-cols-2">
            <Field term="Nama desa" detail={village?.name ?? "—"} />
            <Field term="Kode desa" detail={village?.villageCode ?? "—"} mono />
            <Field term="Kecamatan" detail={village?.district ?? "—"} />
            <Field term="Kabupaten" detail={village?.regency ?? "—"} />
            <Field term="Provinsi" detail={village?.province ?? "—"} />
            <Field
              term="Tahun berdiri"
              detail={village?.establishedYear ? String(village.establishedYear) : "—"}
            />
            <Field term="Kepala Desa" detail={village?.headName ?? "—"} />
            <Field term="NIPD Kepala Desa" detail={village?.headNipd ?? "—"} mono />
            <Field term="Alamat kantor" detail={village?.officeAddress ?? "—"} />
            <Field term="Telepon" detail={village?.officePhone ?? "—"} mono />
            <Field term="Surel" detail={village?.officeEmail ?? "—"} mono />
            <Field term="Website" detail={village?.website ?? "Belum terhubung"} mono />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader
            title="Sesi Petugas"
            description="Informasi sesi berjalan. Sesi berakhir saat petugas keluar dari aplikasi."
            icon={Clock3}
            action={
              <Badge variant="approved" size="sm">
                <span className={cn("size-1.5 rounded-full", TONE_CLASSES.approved.dot)} aria-hidden />
                Shift Aktif
              </Badge>
            }
          />
          {officer ? (
            <dl className="grid gap-x-6 gap-y-3 px-3.5 py-3 sm:grid-cols-2">
              <Field term="Nama petugas" detail={officer.fullName} />
              <Field
                term="Jabatan"
                detail={STAFF_ROLE[officer.role as StaffRole] ?? officer.jobTitle}
              />
              <Field
                term="Mulai bertugas"
                detail={
                  officer.shiftStartedAt ? formatClock(new Date(officer.shiftStartedAt)) : "—"
                }
                mono
              />
              <Field term="Waktu server" detail={formatClock(new Date(now))} mono />
              <Field term="Peran sistem" detail={officer.role} mono />
              <Field
                term="Hak akses"
                detail={Object.entries(ROLE_CAPABILITIES[officer.role as StaffRole] ?? {})
                  .filter(([, granted]) => granted)
                  .map(([capability]) => CAPABILITY_LABEL[capability] ?? capability)
                  .join(", ")}
              />
            </dl>
          ) : (
            <p className="px-3.5 py-6 text-center text-2xs text-fg-subtle">
              Tidak ada sesi petugas yang aktif.
            </p>
          )}

          <div className="border-t border-line bg-surface-muted px-3.5 py-2">
            <p className="flex items-start gap-1.5 text-[10px] leading-4 text-fg-subtle">
              <KeyRound className="mt-0.5 size-3 shrink-0" aria-hidden />
              Tanda tangan elektronik memerlukan passphrase petugas penandatangan dan tidak pernah
              disimpan dalam bentuk terbuka — hanya sidik scrypt yang tersimpan di basis data.
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Perangkat Desa & Hak Akses"
          description="Daftar petugas yang dapat masuk ke aplikasi beserta kewenangannya."
          icon={Users}
          action={
            <Badge variant="outline" size="sm">
              {formatNumber(roster.filter((member) => member.active).length)} aktif
            </Badge>
          }
        />
        <TableFrame caption="Perangkat desa" minWidthClass="min-w-[980px]" busy={staff.isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[230px]")}>Nama</th>
              <th scope="col" className={cn(TH_CLASS, "w-[180px]")}>Jabatan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[220px]")}>Kontak</th>
              <th scope="col" className={cn(TH_CLASS, "w-[220px]")}>Kewenangan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[130px]")}>Beban aktif</th>
              <th scope="col" className={cn(TH_CLASS, "w-[160px]")}>Shift</th>
            </tr>
          </thead>

          {staff.isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-32" },
                { key: "b", width: "w-24" },
                { key: "c", width: "w-32" },
                { key: "d", width: "w-28" },
                { key: "e", width: "w-10" },
                { key: "f", width: "w-20" },
              ]}
              label="Memuat data perangkat desa…"
              rows={5}
            />
          ) : roster.length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={6}
                title="Belum ada perangkat desa terdaftar"
                message="Data perangkat desa diisi oleh Sekdes melalui basis data kependudukan."
              />
            </tbody>
          ) : (
            <tbody>
              {roster.map((member) => {
                const capabilities = ROLE_CAPABILITIES[member.role as StaffRole];
                return (
                  <tr key={member.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                    <td className={TD_CLASS}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface-muted text-[10px] font-semibold text-fg-muted">
                          {member.initials}
                        </span>
                        <div className="flex min-w-0 flex-col leading-4">
                          <span className="truncate text-xs font-medium text-fg">
                            {member.fullName}
                          </span>
                          <span className="truncate font-mono text-[10px] text-fg-subtle">
                            {member.nipd ?? "NIPD belum tercatat"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-col leading-4">
                        <span className="truncate text-xs text-fg-muted">{member.jobTitle}</span>
                        <span className="truncate text-[10px] text-fg-subtle">
                          {STAFF_ROLE[member.role as StaffRole] ?? member.role}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex min-w-0 flex-col leading-4">
                        <span className="truncate text-xs text-fg-muted" title={member.email}>
                          {member.email}
                        </span>
                        <span className="truncate font-mono text-[10px] text-fg-subtle">
                          {member.phone ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-wrap items-center gap-1">
                        {capabilities
                          ? Object.entries(capabilities)
                              .filter(([, granted]) => granted)
                              .map(([capability]) => (
                                <Badge key={capability} variant="neutral" size="sm">
                                  {CAPABILITY_LABEL[capability] ?? capability}
                                </Badge>
                              ))
                          : null}
                        {member.canSign ? (
                          <Badge variant="civic" size="sm">
                            E-Sign
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <span className="tnum text-xs text-fg-muted">
                        {formatNumber(member.openRequests)} berkas
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      {member.onShiftSince ? (
                        <div className="flex flex-col leading-4">
                          <Badge variant="approved" size="sm">
                            Bertugas
                          </Badge>
                          <span className="mt-0.5 truncate text-[10px] text-fg-subtle">
                            {member.station ?? "Loket"} · {formatClock(new Date(member.onShiftSince))}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-fg-subtle">
                          {member.lastSeenAt
                            ? `Terakhir ${formatRelative(member.lastSeenAt, now)}`
                            : "Belum pernah masuk"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </TableFrame>
      </Panel>

      <Panel>
        <PanelHeader
          title="Katalog Layanan Surat"
          description="Jenis surat yang dilayani desa, jumlah persyaratan, dan tenggat pelayanan (SLA)."
          icon={Stamp}
        />
        <TableFrame caption="Katalog layanan surat" minWidthClass="min-w-[720px]" busy={staff.isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[110px]")}>Kode</th>
              <th scope="col" className={cn(TH_CLASS, "w-[320px]")}>Nama layanan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[150px]")}>Persyaratan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[130px]")}>SLA</th>
              <th scope="col" className={cn(TH_CLASS, "w-[150px]")}>Diterbitkan</th>
            </tr>
          </thead>
          {staff.isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-10" },
                { key: "b", width: "w-40" },
                { key: "c", width: "w-12" },
                { key: "d", width: "w-12" },
                { key: "e", width: "w-12" },
              ]}
              label="Memuat katalog layanan…"
            />
          ) : (
            <tbody>
              {letterTypes.map((type) => (
                <tr key={type.code} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                  <td className={TD_CLASS}>
                    <Badge variant="civic" size="sm" mono>
                      {type.code}
                    </Badge>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="truncate text-xs text-fg" title={type.name}>
                      {type.name}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(type.requirementCount)} dokumen
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">{type.slaDays} hari kerja</span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(type.issued)} surat
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </TableFrame>
        <div className="border-t border-line bg-surface-muted px-3.5 py-1.5">
          <p className="text-[10px] leading-4 text-fg-subtle">
            Perubahan identitas desa, SLA layanan, dan susunan perangkat desa dilakukan melalui
            berita acara desa; aplikasi ini menampilkan nilai yang berlaku di basis data. Terakhir
            disinkronkan {formatDate(new Date(now))}.
          </p>
        </div>
      </Panel>
    </>
  );
}

const CAPABILITY_LABEL: Record<string, string> = {
  verify: "Verifikasi berkas",
  sign: "Tanda tangan",
  publish: "Publikasi",
  manageRegistry: "Kelola data",
};

function Field({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.05em] text-fg-subtle">{term}</dt>
      <dd
        className={`mt-0.5 truncate text-xs text-fg ${mono ? "font-mono tabular-nums" : ""}`}
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}
