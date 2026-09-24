"use client";

import { CircleHelp, Keyboard, LifeBuoy, ListOrdered, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Kbd, Panel, PanelHeader } from "@/components/ui/primitives";
import { ROLE_CAPABILITIES, STAFF_ROLE } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/db/schema";

import { PageHeader } from "./page-kit";

/**
 * Bantuan.
 *
 * The operator's manual, in the product rather than in a PDF nobody opens at the
 * counter: the service flow, the keyboard shortcuts that make eight hours of
 * entry bearable, who may do what, and who to call when the e-sign hangs.
 */
export function HelpWorkspace() {
  return (
    <>
      <PageHeader
        eyebrow="Sistem · Panduan Petugas"
        icon={CircleHelp}
        title="Bantuan & Panduan Pelayanan"
        description="Alur pelayanan surat, pintasan papan tik, matriks kewenangan perangkat desa, dan kontak eskalasi teknis untuk operator loket."
      />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Alur Pelayanan Surat"
            description="Tujuh tahap dari pengajuan warga sampai surat diarsipkan."
            icon={ListOrdered}
          />
          <ol className="divide-y divide-line">
            {FLOW.map((step, index) => (
              <li key={step.title} className="flex gap-3 px-3.5 py-2.5">
                <span className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line bg-surface-muted font-mono text-[10px] font-semibold text-fg-muted">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{step.title}</p>
                  <p className="mt-0.5 text-2xs leading-4 text-fg-muted">{step.detail}</p>
                </div>
                <Badge variant="outline" size="sm" className="ml-auto shrink-0 self-start">
                  {step.owner}
                </Badge>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="grid content-start gap-3.5">
          <Panel>
            <PanelHeader title="Pintasan Papan Tik" description="Aktif selama kursor tidak berada di kolom isian." icon={Keyboard} />
            <ul className="divide-y divide-line">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.keys.join("+")} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <span className="text-xs text-fg-muted">{shortcut.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Kewenangan Perangkat Desa"
              description="Tombol yang tidak menjadi kewenangan petugas tidak dirender, bukan sekadar dinonaktifkan."
              icon={ShieldCheck}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse" aria-label="Matriks kewenangan">
                <thead>
                  <tr>
                    <th scope="col" className="h-8 border-b border-line bg-surface-muted px-3 text-left text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle">
                      Peran
                    </th>
                    {["Verifikasi", "Tanda tangan", "Publikasi", "Kelola data"].map((capability) => (
                      <th
                        key={capability}
                        scope="col"
                        className="h-8 border-b border-line bg-surface-muted px-3 text-center text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle"
                      >
                        {capability}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(ROLE_CAPABILITIES) as StaffRole[]).map((role) => {
                    const capabilities = ROLE_CAPABILITIES[role];
                    return (
                      <tr key={role} className="h-8 border-b border-line">
                        <td className="px-3 text-xs text-fg">{STAFF_ROLE[role]}</td>
                        {(
                          [
                            "verify",
                            "sign",
                            "publish",
                            "manageRegistry",
                          ] as const
                        ).map((capability) => (
                          <td key={capability} className="px-3 text-center">
                            <span
                              className={cn(
                                "tnum text-2xs font-semibold",
                                capabilities[capability] ? "text-approved" : "text-fg-subtle",
                              )}
                            >
                              {capabilities[capability] ? "Boleh" : "—"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Kontak & Eskalasi"
              description="Hubungi pihak berikut bila layanan tersendat."
              icon={LifeBuoy}
            />
            <ul className="divide-y divide-line">
              {CONTACTS.map((contact) => (
                <li key={contact.name} className="flex items-start justify-between gap-3 px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">{contact.name}</p>
                    <p className="mt-0.5 text-2xs leading-4 text-fg-muted">{contact.scope}</p>
                  </div>
                  <span className="shrink-0 font-mono text-2xs tabular-nums text-fg-subtle">
                    {contact.contact}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Catatan Data & Privasi"
              description="Aturan yang mengikat seluruh petugas pengguna aplikasi."
              icon={Users}
            />
            <ul className="space-y-2 px-3.5 py-3">
              {POLICIES.map((policy) => (
                <li key={policy} className="flex gap-2 text-2xs leading-4 text-fg-muted">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                  {policy}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

const FLOW = [
  {
    title: "Pengajuan masuk",
    detail:
      "Warga mengajukan lewat website desa atau loket. Sistem membuat nomor tiket dan tenggat SLA otomatis.",
    owner: "Warga",
  },
  {
    title: "Verifikasi berkas",
    detail:
      "Petugas loket memeriksa setiap unggahan: lengkap, buram, tidak ada, atau tidak relevan.",
    owner: "Operator",
  },
  {
    title: "Perbaikan berkas",
    detail:
      "Bila ada dokumen yang tidak memenuhi syarat, pengajuan dikembalikan dengan catatan perbaikan.",
    owner: "Warga",
  },
  {
    title: "Penerusan ke agenda TTD",
    detail: "Berkas lengkap diteruskan ke agenda tanda tangan Kepala Desa.",
    owner: "Sekdes",
  },
  {
    title: "Tanda tangan elektronik",
    detail:
      "Kepala Desa menandatangani dengan passphrase BSrE; nomor sertifikat tersimpan pada surat.",
    owner: "Kades",
  },
  {
    title: "Cetak & serah surat",
    detail: "Surat dicetak ber-QR, diserahkan ke pemohon, dan statusnya berubah menjadi siap diambil.",
    owner: "Operator",
  },
  {
    title: "Arsip",
    detail: "Surat tersimpan di arsip desa dan dapat ditemukan kembali lewat kode verifikasi.",
    owner: "Operator",
  },
] as const;

const SHORTCUTS = [
  { action: "Pencarian warga lintas modul", keys: ["/"] },
  { action: "Fokus ke kolom saring tabel", keys: ["f"] },
  { action: "Tutup panel tinjauan", keys: ["Esc"] },
  { action: "Navigasi antar baris tabel", keys: ["↑", "↓"] },
  { action: "Buka baris yang difokuskan", keys: ["Enter"] },
] as const;

const CONTACTS = [
  {
    name: "Operator Desa — loket pelayanan",
    scope: "Berkas tidak terbaca, data warga tidak ditemukan, salah jenis surat.",
    contact: "(022) 5947012",
  },
  {
    name: "Sekretaris Desa",
    scope: "Eskalasi permintaan perbaikan data kependudukan dan penolakan pengajuan.",
    contact: "sekdes@sukamaju.desa.id",
  },
  {
    name: "Admin BSrE",
    scope: "Sertifikat tanda tangan kedaluwarsa atau passphrase terkunci.",
    contact: "bantuan@bsre.go.id",
  },
] as const;

const POLICIES = [
  "Data kependudukan hanya boleh dibuka untuk keperluan pelayanan yang sedang ditangani warga.",
  "Setiap pembukaan dossier, verifikasi, tanda tangan, dan cetak surat tercatat pada jejak audit dengan nama petugas.",
  "NIK dan nomor KK ditampilkan sebagian pada daftar; pencarian tetap menerima nomor lengkap.",
  "Dokumen warga tidak boleh diunduh ke perangkat pribadi atau diteruskan ke kanal di luar sistem desa.",
] as const;
