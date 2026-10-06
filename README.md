# Digital Village — Sistem Informasi Pelayanan Desa

Dashboard operasional untuk perangkat Desa Sukamaju (antrean pengajuan surat,
verifikasi berkas, tanda tangan elektronik, data kependudukan, pengumuman) plus
**portal warga** untuk pemantauan pengajuan dan **halaman verifikasi publik**
untuk setiap surat yang terbit.

Dibangun dengan Next.js 16 (App Router, React 19), Tailwind v4 dengan design
token **"Civic Slate"** (`app/globals.css`), Radix UI (`components/ui/*`),
Redux Toolkit + RTK Query (`store/api.ts`), Drizzle ORM di atas Postgres
(produksi) / PGlite (pengembangan lokal tanpa server basis data).

---

## Menjalankan Proyek

```bash
npm install
npm run db:reset     # bersihkan + migrasi + seed Desa Sukamaju (deterministik)
npm run dev          # http://localhost:3000
```

Skrip basis data:

| Perintah | Fungsi |
| --- | --- |
| `npm run db:migrate` | Terapkan migrasi SQL dari `db/migrations/` |
| `npm run db:seed` | Isi ulang data demo (lewati jika sudah terisi; `--reset` untuk bangun ulang) |
| `npm run db:reset` | Bersihkan `.data/`, migrasi, lalu seed |
| `npm run db:generate` | Buat migrasi baru dari perubahan `db/schema.ts` (drizzle-kit) |
| `npm run db:studio` | Jelajahi basis data lewat Drizzle Studio |
| `npm run typecheck` / `npm run lint` | `next typegen` + `tsc` / ESLint |

Basis data default berjalan di **PGlite** (file di `.data/pgdata`) sehingga
tidak butuh Postgres eksternal. Untuk Postgres sungguhan:
`DATABASE_DRIVER=postgres DATABASE_URL=postgres://… npm run …`.

> PGlite mengunci berkas datanya ke satu proses — **jangan** menjalankan skrip
> `tsx` bersamaan dengan `npm run dev` terhadap data dir yang sama.

---

## Otentikasi & Otorisasi

Ada tiga audiens dengan batas yang tegas:

| Audiens | Halaman masuk | Setelah masuk |
| --- | --- | --- |
| **Perangkat desa** (8 akun seed) | `/masuk` — email instansi + kata sandi | Dashboard `/` … `/(dashboard)/*` |
| **Warga** | `/warga/masuk` — NIK + kata sandi | Portal warga `/warga` (hanya data miliknya) |
| **Publik** | — | `/verifikasi/[code]` (tanpa login, tanpa perubahan) |

### Sesi

- Sesi disimpan di tabel **`sessions`** (bukan JWT) — cookie `dv_session`
  httpOnly hanya memuat id sesi opaque; identitas selalu diselesaikan dari
  baris basis data, sehingga logout/revocational langsung efektif.
- Sesi berumur 12 jam dengan **pembaruan bergulir** selama aktif; logout
  menandai `revoked_at` dan cookie lama tidak dapat dipakai ulang.
- Login petugas sekaligus **membuka baris `staff_shifts`** (pos layanan dipilih
  di form masuk) — inilah yang menghidupkan indikator "Shift Aktif" di topbar.
  Logout petugas menutup shift tersebut ("Akhiri Shift & Keluar").

### Pelindung rute

- `proxy.ts` di root (konvensi Next.js 16; `middleware.ts` sudah di-rename
  menjadi `proxy`) memantik redirect murah ke `/masuk?next=…` untuk halaman
  dashboard saat cookie tidak ada.
- Validasi sesi yang sesungguhnya ada di server: layout `/(dashboard)`
  (`requireStaffPage`), layout portal (`requireResidentPage`), dan setiap route
  API (`requireStaffSession` / `requireResidentSession` di `lib/auth/guard.ts`).
- Sesi warga **tidak pernah** bisa membuka rute/API dashboard (403/dialihkan ke
  `/warga`), dan sebaliknya. `/verifikasi/[code]` tetap publik sepenuhnya.

### Hak akses per peran (RBAC)

Matriks di `lib/domain.ts#ROLE_CAPABILITIES` — dipakai UI (menu sidebar,
tombol aksi) **dan** divalidasi ulang di server:

| Kemampuan | Operator Desa | Sekdes | Kasi Pelayanan | Kaur TU | Kades | Kepala Dusun |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Verifikasi berkas | ✔ | ✔ | ✔ | ✔ | — | — |
| Tanda tangan surat (`canSign`) | — | — | — | — | ✔ | — |
| Publikasi pengumuman | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Kelola data kependudukan | ✔ | ✔ | ✔ | ✔ | — | — |
| Pengaturan desa (`/pengaturan`, roster) | ✔ | ✔ | — | — | ✔ | — |

### Tanda tangan elektronik (e-sign)

Upacara TTD terikat pada **sesi**, bukan pada "petugas canSign mana pun":

- `POST /api/requests/[id]/sign` selalu menandatangani sebagai staff yang
  login; peran lain — bahkan yang mengetahui frasa sandinya — ditolak 403.
- Frasa sandi diverifikasi terhadap sidik **scrypt**
  (`lib/auth/password.ts`, skema yang sama untuk kata sandi login).
- Pejabat penanda tangan mengaktivasi/mengganti frasa sandinya sendiri
  melalui menu **"Profil & Hak Akses" → Sertifikat Tanda Tangan Elektronik**
  (`POST /api/auth/esign-passphrase`); rotasi menuntut frasa sandi lama.
- Perlindungan penyalahgunaan: **5 percobaan gagal** (login maupun frasa sandi
  TTD, per akun) mengunci akun/sertifikat selama **15 menit**. Semua percobaan
  gagal, kunci, login, logout, dan tanda tangan tercatat di `activity_log`
  (`MASUK_LOG`, `KELUAR_LOG`, `AKTIVASI_TTD`, `KEAMANAN_AKUN`) — tanpa pernah
  mencatat kata sandi/frasa sandinya.
- Petunjuk "lingkungan latihan" berisi frasa sandi demo hanya tampil saat
  `NODE_ENV !== "production"` **dan** `ESIGN_PASSPHRASE` tidak diset. Di
  produksi frasa sandi harus diaktivasi pribadi oleh penanda tangan.

### Portal warga

- Akun warga = `resident_accounts` (NIK + scrypt hash), diterbitkan petugas di
  loket setelah verifikasi identitas — NIK dipilih karena satu-satunya
  identifier yang sudah dipercaya desa.
- Portal menampilkan **hanya** pengajuan dengan
  `applicant_resident_id` = pemohon yang login (filter di SQL, bukan di UI),
  serta unduh PDF final **setelah** surat ditandatangani
  (`GET /api/warga/requests/[id]/pdf` — pemilik lain mendapat 404, bukan 403,
  agar id tiket tidak bisa dijelajahi).
- **Pengajuan surat baru secara daring belum tersedia** (disengaja, lihat
  "Rencana lanjutan") — pengajuan tetap melalui loket.

---

## Akun Demo (data seed lokal — bukan untuk produksi)

Seed (`npm run db:reset`) membuat Desa Sukamaju lengkap dengan kredensial
masuk yang stabil:

| Peran | Login | Kata sandi |
| --- | --- | --- |
| Operator Desa | `operator@sukamaju.desa.id` | `sukamaju-2026` |
| Sekretaris Desa | `sekdes@sukamaju.desa.id` | `sukamaju-2026` |
| Kasi Pelayanan | `budi.santoso@sukamaju.desa.id` | `sukamaju-2026` |
| Kaur Tata Usaha | `kaurtu@sukamaju.desa.id` | `sukamaju-2026` |
| **Kepala Desa** (penanda tangan) | `kades@sukamaju.desa.id` | `sukamaju-2026` |
| Kepala Dusun 01 | `kadus01@sukamaju.desa.id` | `sukamaju-2026` |
| Warga demo (portal) | NIK `3204160101801234` | `warga-sukamaju-2026` |

Frasa sandi sertifikat TTD Kades (lingkungan latihan): `sukamaju-ttd-2026` —
di-set lewat `ESIGN_PASSPHRASE` saat seed, atau biarkan Kades mengaktivasi
frasa sandinya sendiri lewat menu Profil & Hak Akses. Nilai-nilai ini
dideklarasikan di `lib/auth/demo.ts` sebagai **data seed pengembangan lokal**
dan tidak boleh dianggap rahasia.

### Variabel lingkungan

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_DRIVER` | `pglite` (default) atau `postgres` |
| `DATABASE_URL` | Wajib bila `DATABASE_DRIVER=postgres` |
| `ESIGN_PASSPHRASE` | Frasa sandi TTD Kades untuk seed (min. 8 karakter). Tanpa ini seed memakai nilai latihan; di produksi **wajib** diset atau diaktivasi mandiri |
| `DV_SKIP_AUTOSEED` | `1` untuk mematikan auto-seed bootstrap |
| `PGLITE_DATA_DIR` | Lokasi data dir PGlite (default `.data/pgdata`) |

---

## Struktur Penting

```
proxy.ts                     pelindung rute murah (konvensi Next 16; cek cookie saja)
lib/auth/policy.ts           konstanta kebijakan murni (TTL sesi, lockout, sanitasi redirect)
lib/auth/password.ts         hash/verify scrypt (dipakai login & frasa sandi TTD)
lib/auth/session.ts          siklus sesi: buat/perbarui/cabut + pencatatan gagal login
lib/auth/guard.ts            penegakan: require*Session (API, lempar 401/403) & require*Page (redirect)
lib/auth/demo.ts             kredensial seed lokal (berlabel jelas)
app/api/auth/*               login staff, login warga, logout, aktivasi frasa sandi TTD
app/api/warga/requests/[id]/pdf   unduh PDF final milik pemohon (sesi warga)
app/(auth)/masuk, app/(auth)/warga/masuk   halaman masuk
app/(portal)/warga           portal warga (layout + beranda)
db/schema.ts                 staff.password_hash, sessions, resident_accounts, enum audit baru
db/commands.ts#signLetterRequest    upacara TTD terikat staffId sesi + lockout
components/dashboard/officer-profile-dialog.tsx   profil, hak akses, aktivasi sertifikat TTD
```

## Rencana lanjutan (di luar cakupan implementasi ini)

- **Pengajuan surat baru dari portal warga** (unggah berkas + verifikasi
  loket) — portal saat ini hanya memantau dan mengunduh.
- Integrasi **BSrE sungguhan** untuk sertifikat TTD (nomor seri saat ini
  dicetak lokal oleh `signLetterRequest`).
- 2FA / SSO untuk akun petugas, dan pengelolaan akun warga dari dashboard
  (terbit/atur ulang kata sandi di loket).
- Multi-desa/multi-tenant — skema sudah menyimpan `village_id`, tapi UI dan
  sesi masih satu desa.
