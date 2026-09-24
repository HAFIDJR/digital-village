# Dashboard Operator & Perangkat Desa

Sistem Informasi Pelayanan Desa — an administrative dashboard for village-office
staff (Operator Desa, Sekdes, Kepala Desa) serving **Desa Sukamaju, Kabupaten
Bandung**.

Dense, keyboard-first, and built for an eight-hour shift at a desk: a worklist
that can be filtered and worked end-to-end, an e-signature ceremony for the
Kepala Desa, printable letters with QR verification, and a public page that
proves a printed letter is genuine.

```bash
npm install
npm run dev          # http://localhost:3000 — auto-migrates and seeds on first load
```

The first request boots PostgreSQL (PGlite/WASM), applies migrations and seeds
the village. Nothing else is required: no external database, no Docker.

---

## What is on the screen

| Section | Content |
| --- | --- |
| **Topbar** | Village seal and name, global instant search (`/`), working date, live shift indicator, notifications, signed-in officer |
| **Sidebar** | Grouped navigation with live queue counts; collapses to an icon rail, becomes an off-canvas drawer below `lg` |
| **4 KPI cards** | Surat Masuk Hari Ini · Total Penduduk Aktif · Laporan/Aspirasi Warga · Status Kades E-Sign |
| **Primary workspace** | `Antrean Pengajuan Surat Warga` — dense paginated table (ID & Waktu · Nama & NIK · Jenis Surat · Dusun/RT/RW · Kelengkapan Berkas · Status · Tindakan) |
| **Secondary split (60/40)** | `Aktivitas Pelayanan Terkini` audit trail ∥ `Widget Cepat Pengumuman Desa` |
| **Slide-over** | Citizen dossier: resident metadata, uploaded ID/Kartu Keluarga preview, per-document verdicts, e-sign ceremony, `Cetak Draft Surat PDF` |
| **Reports** | Laporan & aspirasi warga with category, SLA age, and status |

Every figure is derived from the database. There is no hard-coded fixture in the
UI layer — re-running the seed reproduces the same village, because all
randomness flows through a seeded PRNG.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Styling | Tailwind CSS v4 with a token layer in `app/globals.css` |
| Components | Hand-authored Shadcn-style primitives (cva + Radix) in `components/ui` |
| State | Redux Toolkit + RTK Query (`store/`) |
| Database | PostgreSQL — PGlite (WASM) by default, `postgres-js` in production |
| ORM | Drizzle (`db/schema.ts`, versioned SQL in `db/migrations`) |
| Validation | Zod — one schema per API contract and per form (`lib/validators.ts`) |
| Icons / type | `lucide-react`; Inter, Plus Jakarta Sans, JetBrains Mono (self-hosted) |

```bash
npm run dev              # dev server on 0.0.0.0:3000
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # next typegen && tsc --noEmit
npm run db:seed          # seed (idempotent; -- --reset to rebuild)
npm run db:reset         # wipe .data, migrate, seed
```

`DATABASE_DRIVER=postgres DATABASE_URL=postgres://…` switches to a real server
with no code change. The session timezone is pinned to `Asia/Jakarta` for both
drivers, so "surat masuk hari ini" means the office day, not the host's UTC day.

## Domain rules that are enforced, not decorative

- **Verification is two desks.** `Setujui` attests that a file is complete
  (`PENDING_VERIFIKASI → DIVERIFIKASI`); a second press forwards it for signature
  (`DIVERIFIKASI → MENUNGGU_TTD_KADES`). The state machine lives in
  `db/commands.ts` and refuses illegal transitions with an explanation.
- **Documents gate approval.** A request cannot be approved while any uploaded
  document is marked buram / tidak ada. The officer records per-document verdicts
  and the decision in one transaction, so the audit entry can never disagree with
  the state change.
- **Signing is personal.** The e-sign ceremony verifies the signer's scrypt-hashed
  passphrase in constant time, requires `can_sign`, and mints a certificate
  serial that is stamped into the letter, the audit trail and the QR verification
  page. Wrong passphrase → `401`; unactivated credential → `409`, never a silent
  signature.
- **A final print is only issued after a signature.** Drafts watermark; finals
  carry the QR code and the certificate serial. Every print run is recorded
  before the bytes leave the server.
- **Publishing announcements is role-gated.** The composer is disabled for a role
  without the capability, and the API enforces the same rule independently.

Training passphrases and seeded credentials are labelled as such in the UI and
printed by `npm run db:seed`.

## Public verification page

Each printed letter carries a QR code pointing at `/verifikasi/<12-char code>`.
The page is outside the dashboard chrome and reveals only what is already printed
on the letter — never addresses, family data or uploads. It confirms that the
code resolves to a real, signed document, which is the property a forged letter
cannot reproduce.

## Accessibility

Skip link, labelled landmarks, semantic table with `scope="col"`, `aria-sort`,
roving row focus with Enter/Space, Escape to close overlays, visible focus rings
throughout, `aria-live` announcements when the filtered queue changes, and
`aria-current` on the active navigation entry. Relative timestamps render from a
single shared clock (`components/dashboard/now-context.tsx`) so server and client
markup agree.

## Layout

```
app/            routes, layout, global styles, providers
app/api/        route handlers (health, workspace, requests, search, …)
components/ui/  Shadcn-style primitives
components/dashboard/  dashboard surfaces
db/             schema, migrations, queries, commands, seed
lib/            formatters, domain metadata, Zod contracts, PDF writer
store/          Redux slices + RTK Query API
```
