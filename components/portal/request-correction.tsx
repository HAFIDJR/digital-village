"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Correction = { version: string; note: string | null; documents: { docKey: string; label: string; note: string | null; missing: boolean }[] };

export function RequestCorrection({ id, onSubmitted }: { id: string; onSubmitted: (ticket: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Correction | null>(null);
  const [files, setFiles] = React.useState<Record<string, File>>({});
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setError(""); setDetail(null); setFiles({}); setOpen(true);
    try {
      const response = await fetch(`/api/warga/requests/${id}/resubmission`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Tidak dapat memuat berkas.");
      setDetail(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Tidak dapat memuat berkas."); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData();
    form.append("version", detail.version);
    for (const doc of detail.documents) {
      const file = files[doc.docKey];
      if (!file) { setError(`Pilih berkas ${doc.label}.`); return; }
      form.append(`file:${doc.docKey}`, file);
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/warga/requests/${id}/resubmission`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Pengiriman gagal.");
      onSubmitted(data.ticket);
    } catch (e) { setError(e instanceof Error ? e.message : "Pengiriman gagal."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 rounded border border-line p-3 text-xs">
    <Button size="sm" variant="secondary" onClick={() => open ? setOpen(false) : load()}>{open ? "Tutup perbaikan" : "Perbaiki berkas"}</Button>
    {open && <form onSubmit={submit} className="mt-3 space-y-3">
      {detail?.note && <p>Catatan petugas: {detail.note}</p>}
      {detail && !detail.documents.length && <p>Petugas belum menandai berkas yang perlu diperbaiki. Hubungi kantor desa untuk penjelasan.</p>}
      {detail?.documents.map((doc) => <label key={doc.docKey} className="block rounded border border-line p-2">
        <span className="font-semibold">{doc.label} · {doc.missing ? "Belum ada" : "Perlu diperbaiki"}</span>
        {doc.note && <span className="mt-1 block">Catatan petugas: {doc.note}</span>}
        <input className="mt-2 block max-w-full" type="file" accept=".pdf,image/jpeg,image/png" required disabled={busy}
          onChange={(e) => { const file = e.target.files?.[0]; setFiles((prev) => { const next = { ...prev }; if (file) next[doc.docKey] = file; else delete next[doc.docKey]; return next; }); }} />
        {files[doc.docKey] && <span className="mt-1 block">Pilihan: {files[doc.docKey].name} · {(files[doc.docKey].size / 1024 / 1024).toFixed(2)} MB</span>}
      </label>)}
      {detail && detail.documents.length > 0 && <><p>Periksa nama berkas di atas. JPG, PNG, atau PDF, maksimal 5 MB per berkas. Berkas baru belum dianggap terverifikasi.</p>
        <Button type="submit" size="sm" disabled={busy || detail.documents.some((doc) => !files[doc.docKey])}>{busy ? "Mengirim…" : "Kirim untuk verifikasi ulang"}</Button></>}
      {error && <p role="alert" className="text-rejected">{error} <button type="button" className="underline" onClick={load}>Muat ulang</button></p>}
    </form>}
  </div>;
}
