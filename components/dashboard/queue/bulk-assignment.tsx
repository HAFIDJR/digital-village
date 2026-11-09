"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { QueueRow } from "@/db/queries";
import { useAppDispatch } from "@/store";
import { TAG, villageApi } from "@/store/api";
import { QueueTable } from "./queue-table";

type StaffOption = { id: string; fullName: string; jobTitle: string };
type Result = { id: string; outcome: "updated" | "unchanged" | "failed"; reason?: string };

export function BulkAssignment({ rows, loading, now, focusRowIndex }: {
  rows: QueueRow[]; loading: boolean; now: number; focusRowIndex: number;
}) {
  const dispatch = useAppDispatch();
  const [staff, setStaff] = React.useState<StaffOption[] | null>(null);
  const [selected, setSelected] = React.useState<Record<string, QueueRow>>({});
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/requests/bulk-assignment", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setStaff(data.staff); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const chosen = Object.values(selected);
  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/requests/bulk-assignment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: target, requests: chosen.map((row) => ({ id: row.id, status: row.status, assignedStaffId: row.assignedStaffId, updatedAt: row.updatedAt })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Penugasan gagal.");
      const results = data.results as Result[];
      const updated = results.filter((r) => r.outcome === "updated").length;
      const unchanged = results.filter((r) => r.outcome === "unchanged").length;
      const failed = results.filter((r) => r.outcome === "failed");
      setMessage(`${failed.length ? (updated || unchanged ? "Sebagian berhasil" : "Penugasan gagal") : "Penugasan selesai"}: ${updated} diperbarui, ${unchanged} sudah sesuai, ${failed.length} gagal. ${failed.map((r) => `${selected[r.id]?.ticket ?? r.id}: ${r.reason}`).join(" ")}`);
      setSelected({});
      dispatch(villageApi.util.invalidateTags([TAG.Queue, TAG.Workspace, TAG.Activity, TAG.Request]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penugasan gagal.");
    } finally { setBusy(false); }
  }
  return <>
    {staff && <div className="border-b border-line px-4 py-3 text-xs">
      <p className="font-semibold">Penugasan massal · {chosen.length} dipilih</p>
      {chosen.length > 0 && <p className="mt-1">Pilihan: {chosen.map((row) => row.ticket).join(", ")}</p>}
      <p className="my-1 text-fg-subtle">Pilihan hanya berlaku untuk halaman dan saringan ini; berubah saat halaman atau saringan diganti.</p>
      <div className="flex flex-wrap gap-3 my-2">
        {rows.filter((row) => ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DIVERIFIKASI"].includes(row.status)).map((row) =>
          <label key={row.id} className="flex items-center gap-1">
            <input type="checkbox" checked={!!selected[row.id]} disabled={busy}
              onChange={(event) => { const checked = event.target.checked; setSelected((prev) => {
                const next = { ...prev }; if (checked) next[row.id] = row; else delete next[row.id]; return next;
              }); }} /> {row.ticket} · {row.applicantName}
          </label>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Petugas tujuan" value={target} onChange={(e) => setTarget(e.target.value)} className="rounded border border-line p-1">
          <option value="">Pilih petugas</option>
          {staff.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.jobTitle}</option>)}
        </select>
        <Button size="sm" disabled={!chosen.length || !target || busy} onClick={submit}>Tugaskan pilihan</Button>
      </div>
      {message && <p role="status" className="mt-2">{message}</p>}
    </div>}
    <QueueTable rows={rows} loading={loading} now={now} focusRowIndex={focusRowIndex} />
  </>;
}
