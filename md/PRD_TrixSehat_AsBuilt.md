# Product Requirements Document (Reverse / As-Built)
## TrixSehat — Hospital Information System (HIS) Terintegrasi

---

**Versi Dokumen:** 2.0 (Reverse-Engineered dari kode produksi)
**Tanggal:** 09 Juli 2026
**Status:** As-Built — mencerminkan fitur yang benar-benar terpasang di kode
**Basis Rekonstruksi:** Branch `dithdyt/full-feature` · commit `ec446e0`
**Pemilik Produk:** Tim TrixSehat

> **Catatan Dokumen.** Ini adalah *reverse PRD* — direkonstruksi dari sistem yang **sudah jadi**, bukan rencana. Setiap fitur, aturan bisnis, dan kriteria penerimaan di sini sudah dapat ditelusuri ke berkas kode nyata (dirujuk dalam format `path:baris`). Untuk PRD perencanaan awal (visi 6 peran, target metrik), lihat [PRD_TrixSehat.md](PRD_TrixSehat.md).

---

## Daftar Isi

1. [Executive Summary (As-Built)](#1-executive-summary-as-built)
2. [Arsitektur & Teknologi](#2-arsitektur--teknologi)
3. [Peran Pengguna & RBAC](#3-peran-pengguna--rbac)
4. [Model Data](#4-model-data)
5. [Katalog Fitur per Modul](#5-katalog-fitur-per-modul)
6. [Referensi API](#6-referensi-api)
7. [Aturan Bisnis Inti](#7-aturan-bisnis-inti)
8. [Rekonstruksi Sprint (Reverse)](#8-rekonstruksi-sprint-reverse)
9. [Persyaratan Non-Fungsional (Aktual)](#9-persyaratan-non-fungsional-aktual)
10. [Batasan & Aspek Tersimulasi](#10-batasan--aspek-tersimulasi)
11. [Data Seed & Akun Uji](#11-data-seed--akun-uji)
12. [Roadmap Lanjutan](#12-roadmap-lanjutan)
13. [Glosarium](#13-glosarium)

---

## 1. Executive Summary (As-Built)

TrixSehat adalah aplikasi web **Hospital Information System (HIS)** yang mengintegrasikan alur layanan RSU dari pendaftaran online hingga pelunasan tagihan, dibangun sebagai satu aplikasi Next.js (App Router) dengan database SQLite lokal. Sistem sudah berjalan menyeluruh untuk **4 peran** (Pasien, Staf Medis, Admin Kasir/Farmasi, Super Admin/Direksi) dan mengeksekusi rantai klinis end-to-end secara transaksional:

```
Booking Online → Antrean Poli → Panggil Pasien → Rekam Medis + E-Resep →
Potong via Apotek → Tagihan Otomatis → Pembayaran Kasir → Selesai
```

**Tiga pilar produk yang benar-benar terpasang:**

1. **Booking Antrean Online** — pasien (login *maupun* tamu) memesan nomor antrean per poli/dokter/slot waktu; nomor antrean digenerate otomatis per tanggal (`A-0001`, `A-0002`, …). Guard mencegah antrean ganda.
2. **Live Ward Tracker (Status Kamar)** — ketersediaan kamar rawat ditampilkan real-time (polling 5 detik) untuk pasien, dengan kontrol status penuh + audit log untuk Perawat VK.
3. **E-Prescription → Billing Otomatis** — dokter menerbitkan resep digital; satu transaksi database membentuk Rekam Medis Elektronik (RME) **dan** tagihan (jasa dokter + administrasi + obat), lengkap dengan potongan BPJS bila aktif.

Ditambah fitur pendukung yang aktif: **jalur darurat maternal** (auto-reservasi kamar + fallback rujukan saat penuh), **antrean farmasi**, **konfirmasi pembayaran kasir + ringkasan pendapatan** (hari/minggu/bulan), **notifikasi in-app** (termasuk untuk pasien tamu), **manajemen profil + BPJS**, dan **jadwal praktek dokter** yang otomatis menghasilkan slot booking per 30 menit.

---

## 2. Arsitektur & Teknologi

### 2.1 Tumpukan Teknologi (dari `package.json`)

| Lapisan | Teknologi | Versi |
|---|---|---|
| Framework | Next.js (App Router, RSC + Route Handlers) | ^15.1.0 |
| UI Runtime | React / React DOM | ^19.0.0 |
| Bahasa | TypeScript | ^5.7.2 |
| Styling | Tailwind CSS + `tailwind-merge` + `clsx` + `class-variance-authority` | 3.4.x |
| Komponen | Radix UI (`react-slot`), pola shadcn/ui (`components/ui/*`) | — |
| Ikon | `lucide-react` | ^0.468 |
| ORM | Drizzle ORM + Drizzle Kit | ^0.45 / ^0.31 |
| Database | SQLite via `better-sqlite3` (embedded, sinkron) | ^12.10 |
| Autentikasi | `better-auth` (email/password + plugin `username`, `nextCookies`) | ^1.6 |
| Fetching Klien | SWR (polling interval) | ^2.4 |

### 2.2 Bentuk Aplikasi

- **Monolith Next.js** — UI dan API berada dalam satu proyek. Empat halaman utama masing-masing satu peran: [app/page.tsx](../app/page.tsx) (Pasien), [app/medis/page.tsx](../app/medis/page.tsx) (Medis), [app/admin/page.tsx](../app/admin/page.tsx) (Admin), [app/staff/page.tsx](../app/staff/page.tsx) (Gerbang login staf).
- **Route Handlers** di `app/api/*` sebagai lapisan bisnis, semua `runtime = "nodejs"`.
- **Database bootstrap idempoten** — [db/init.ts](../db/init.ts) `ensureDatabase()` membuat tabel `IF NOT EXISTS`, menjalankan migrasi kolom inkremental (`addColumnIfMissing`), migrasi tabel `pendaftaran` legacy → skema baru, dan menyemai data operasional + akun staf pada boot pertama.
- **Proteksi rute** via [middleware.ts](../middleware.ts) — mengecek `role` dari sesi (fetch `/api/auth/get-session`) untuk gerbang `/medis`, `/admin`, `/staff`.
- **Real-time = polling** — komponen memakai SWR `refreshInterval` (antrean & kamar 5 dtk, jadwal 10 dtk); tidak ada WebSocket/SSE.

### 2.3 Diagram Modul Aktual

```
                    ┌──────────────────────────────────────┐
                    │      better-auth (email/password)     │
                    │   role: pasien│medis│admin│super_admin │
                    └───────────────────┬───────────────────┘
                                        │ middleware.ts (gate)
        ┌───────────────┬───────────────┼──────────────────┬─────────────────┐
        ▼               ▼               ▼                  ▼                 ▼
   app/page.tsx    app/medis       app/admin         app/staff          /api/*
   (Pasien)        (Dokter+VK)     (Kasir+Apotek)    (Login staf)    Route Handlers
        │               │               │                                   │
        └──── booking ──┴── simulate ───┴── resep/billing ──── kamar ───────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │   Drizzle ORM → SQLite     │
                          │  (better-sqlite3, sync)    │
                          └────────────────────────────┘
```

---

## 3. Peran Pengguna & RBAC

Sistem final menggunakan **4 role** pada kolom `user.role` (bukan 6 seperti visi awal; peran-peran RS digabung). Otorisasi ditegakkan di dua tempat: [middleware.ts](../middleware.ts) (level rute) dan pengecekan `role` di tiap Route Handler.

| Role (`user.role`) | Persona RS | Gabungan dari Visi Awal | Halaman | Akses Kunci |
|---|---|---|---|---|
| `pasien` | Pasien / Ibu hamil / Tamu | Pasien | `/` | Booking, Status Kamar (read), Riwayat, Tagihan, Profil, Darurat |
| `medis` | Dokter Spesialis **&** Perawat VK | Dokter + Perawat VK | `/medis` | Antrean, Panggil pasien, RME + E-Resep, Jadwal praktek, Kontrol status kamar |
| `admin` | Kasir **&** Apoteker | Front Office + Apoteker + Kasir | `/admin` | Antrean farmasi, Konfirmasi bayar, Ringkasan pendapatan |
| `super_admin` | Direksi (Dirut) | Manajemen | `/admin` + `/medis` | Superset admin **dan** medis; dapat beralih dashboard |

### 3.1 Matriks Otorisasi (ditegakkan di kode)

| Aksi | Endpoint | pasien | medis | admin | super_admin |
|---|---|:--:|:--:|:--:|:--:|
| Buat booking | `POST /api/booking` | ✅ (+ tamu) | ✅ | ✅ | ✅ |
| Lihat antrean poli (semua) | `GET /api/booking` | hanya milik sendiri | per-dokter / VK: semua | semua | semua |
| Ubah status antrean (panggil/batal) | `PATCH /api/booking` | batal milik sendiri | ✅ | ✅ | ✅ |
| Ubah status kamar | `PATCH /api/kamar` | ❌ | ✅ | ❌ | ✅ |
| Terbitkan RME + resep | `POST /api/simulate-flow` | simulasi milik sendiri | ✅ (per antrean) | ❌ | ✅ (via medis) |
| Tandai resep "Siap diambil" | `PATCH /api/resep` | ❌ | ❌ | ✅ | ✅ |
| Konfirmasi pembayaran LUNAS | `PATCH /api/billing` | ❌ | ❌ | ✅ | ✅ |
| Atur jadwal praktek | `POST /api/jadwal` | ❌ | ✅ | ❌ | ✅ |
| Panggilan darurat maternal | `POST /api/emergency` | ✅ (+ tamu) | ✅ | ✅ | ✅ |

Perbedaan Dokter vs Perawat VK di dalam role `medis` dibedakan **berdasarkan email**, bukan role terpisah: `doctorNameByEmail` menandai dokter; `siti.vk@trixsehat.com` menandai Perawat VK ([app/medis/page.tsx:185-186](../app/medis/page.tsx#L185-L186), [app/api/booking/route.ts:26-34](../app/api/booking/route.ts#L26-L34)).

---

## 4. Model Data

Skema di [db/schema.ts](../db/schema.ts). Semua timestamp `unixepoch()`. Relasi didefinisikan via Drizzle `relations`.

### 4.1 Tabel Autentikasi (better-auth)

| Tabel | Fungsi | Kolom penting |
|---|---|---|
| `user` | Akun + profil | `id`, `name`, `email`(unik), `role`(default `pasien`), `username`(unik), `phoneNumber`, `nik`, `address`, `nomorBpjs`, `statusBpjs`(default `Non-Aktif`) |
| `session` | Sesi login | `token`(unik), `expiresAt`, `userId` |
| `account` | Kredensial/OAuth | `providerId`, `password`(hashed), `userId` |
| `verification` | Token verifikasi | `identifier`, `value`, `expiresAt` |

### 4.2 Tabel Domain Klinis

**`pendaftaran`** — booking & antrean poli ([schema.ts:115](../db/schema.ts#L115))

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | text PK | UUID |
| `nomor_antrean` | text | `A-0001` (poli) / `EMG-001` (darurat) |
| `nik`, `nama_pasien`, `tgl_kunjungan` | text | Identitas & tanggal |
| `poliklinik` | text | default *Poliklinik Kebidanan & Kandungan (Obgyn)* |
| `dokter` | text | default *dr. Coralin Santoso, Sp.OG* |
| `jam_kunjungan` | text | default `09:00` |
| `metode_pembayaran` | enum | `Mandiri` \| `BPJS` \| `Asuransi` |
| `no_asuransi`, `keluhan`, `alasan_batal` | text | opsional |
| `status` | enum | `MENUNGGU` \| `DIPANGGIL` \| `SELESAI` \| `BATAL` |
| `userId` | text FK→user | `null` untuk tamu; diisi `guest-<id>` saat diproses |

**`jadwal_dokter`** — jadwal praktek → generator slot ([schema.ts:143](../db/schema.ts#L143)): `dokterId`, `jamMulai`, `jamSelesai`, `kuota`(default 8).

**`rekam_medis_elektronik`** (RME) ([schema.ts:153](../db/schema.ts#L153)): `idRme`, `userId`, `keluhanUtama`, `diagnosaIcd10`, `tindakanMedis`, `resepObat`(JSON: `{nama, dosis, harga, qty?}[]`), `statusResep`(default *Diproses apotek* → *Siap diambil*).

**`pembayaran_billing`** ([schema.ts:175](../db/schema.ts#L175)): `userId`, `idRme`, `idPendaftaran`, `deskripsi`, `biayaJasaDokter`, `biayaObat`, `total`, `potonganAsuransi`, `grandTotal`, `status`(`TERTUNDA`\|`LUNAS`), `tglLunas`.

**`kamar_vk_rawat`** — kamar rawat/VK ([schema.ts:99](../db/schema.ts#L99)): `idKamar`(PK), `jenisKamar`, `status`(`Tersedia`\|`Terisi`\|`Sedang Dibersihkan`\|`Tidak Aktif`), `idPasien`, `tipeMasuk`(`Pasien Darurat`\|`Rujukan Dokter`).

**`log_aktivitas_vk`** — audit trail kamar ([schema.ts:201](../db/schema.ts#L201)): `idKamar`, `status`, `actorName`, `createdAt`.

**`notifikasi`** ([schema.ts:216](../db/schema.ts#L216)): `id`(autoincrement), `userId`(nullable), `guestIdDaftar`(FK→pendaftaran, untuk tamu), `pesan`, `tglNotif`, `isRead`.

### 4.3 Diagram Relasi (ringkas)

```
user 1─┬─* pendaftaran ─────┐
       ├─* rekam_medis ─────┼─1 pembayaran_billing
       ├─* pembayaran       ─┘        │
       ├─* jadwal_dokter               (idPendaftaran / idRme)
       ├─* kamar_vk_rawat (idPasien)
       └─* notifikasi
kamar_vk_rawat 1─* log_aktivitas_vk
```

---

## 5. Katalog Fitur per Modul

Setiap fitur di bawah **sudah terpasang**. Format: deskripsi → user story → kriteria penerimaan (terverifikasi di kode) → rujukan.

### 5.1 Modul Pasien (`/` — [app/page.tsx](../app/page.tsx))

Portal SPA dengan tab: **Dashboard · Janji Temu · Riwayat · Status Kamar · Kesehatan Anak · Profil** ([app/page.tsx:166-172](../app/page.tsx#L166-L172)), plus tab booking dan modal (Auth, Profil, Password, Tiket, Darurat).

#### F-1.1 Registrasi & Login Pasien
> *Sebagai pasien, saya ingin membuat akun dan login agar riwayat, resep, dan tagihan tersimpan atas nama saya.*

- Registrasi via modal in-app (`authMode` masuk/daftar) memakai `authClient.signUp` dengan field wajib **NIK + nomor HP** ([app/page.tsx:842-886](../app/page.tsx#L842-L886)).
- Login email/password (`better-auth`); sesi disimpan lewat cookie (`nextCookies`).
- Ganti password via modal terpisah.
- **Mode Tamu:** pasien dapat booking & memantau tanpa akun; state diikat ke `guestIdDaftar` di `localStorage`.

#### F-1.2 Booking Antrean Online ⭐
> *Sebagai pasien, saya ingin memesan antrean dari rumah, memilih poli, dokter, dan jam.*

**Kriteria penerimaan (terverifikasi):**
- Pasien memilih **poli** (5 poli) → **dokter** (dependent, `DOCTORS_BY_CLINIC`) → **slot jam** (dari jadwal dokter, per 30 menit) → **metode bayar** ([app/page.tsx:175-195](../app/page.tsx#L175-L195), [app/api/jadwal/route.ts:11-25](../app/api/jadwal/route.ts#L11-L25)).
- Validasi **NIK minimal 8 karakter**; kalau kurang → `400 ValidationError` ([app/api/booking/route.ts:189-194](../app/api/booking/route.ts#L189-L194)).
- Nomor antrean digenerate **`A-<urut 4 digit>` per tanggal kunjungan** ([booking/route.ts:221-227](../app/api/booking/route.ts#L221-L227)).
- **Guard antrean ganda:** jika pasien punya antrean `MENUNGGU`/`DIPANGGIL` aktif → `409 ActiveBookingExists` ([booking/route.ts:196-219](../app/api/booking/route.ts#L196-L219)).
- Sukses → tiket booking (modal cetak) + notifikasi "Booking antrean … berhasil dibuat".

#### F-1.3 Tiket Janji Temu & Pembatalan
- Tab **Janji Temu** menampilkan tiket aktif dengan nomor antrean, urutan, poli, dokter, jam ([app/page.tsx:1401](../app/page.tsx#L1401)).
- Pasien membatalkan antrean aktif sendiri → status `BATAL`, alasan "Dibatalkan oleh pasien" + notifikasi ([booking/route.ts:365-398](../app/api/booking/route.ts#L365-L398)).
- Notifikasi pembatalan-oleh-dokter dapat di-*acknowledge* (arsip → `SELESAI`) ([booking/route.ts:327-363](../app/api/booking/route.ts#L327-L363)).

#### F-1.4 Live Ward Tracker — Status Kamar (read) ⭐
> *Sebagai ibu hamil, saya ingin tahu ketersediaan kamar sebelum berangkat.*

- Tab **Status Kamar** menampilkan kartu tiap kamar + badge status berwarna, refresh via polling ([app/page.tsx:1876-1935](../app/page.tsx#L1876-L1935)).
- Sumber `GET /api/kamar` — publik (tanpa login) mengembalikan daftar kamar + ringkasan `{total, available}` per jenis ([app/api/kamar/route.ts:11-47](../app/api/kamar/route.ts#L11-L47)).

#### F-1.5 Panggilan Darurat Maternal ⭐
> *Sebagai pasien darurat melahirkan, saya ingin satu tombol yang mengamankan kamar dan mengirim ambulans.*

- Tombol darurat → `POST /api/emergency`. Jika ada "Kamar Rawat Umum" `Tersedia`: buat antrean `EMG-<3 digit>` status `DIPANGGIL`, **reservasi kamar** (`Terisi`, `tipeMasuk = Pasien Darurat`), notifikasi "Ambulans OTW & kamar … dicadangkan" — semua **transaksional** ([app/api/emergency/route.ts:45-86](../app/api/emergency/route.ts#L45-L86)).
- Jika penuh → `409 WardFull` dengan pesan pengalihan ambulans ke RS rujukan (modal `EmergencyWardFullModal`) ([emergency/route.ts:33-42](../app/api/emergency/route.ts#L33-L42)).

#### F-1.6 Riwayat, Resep & Tagihan Pasien
- Tab **Riwayat** menggabungkan riwayat kunjungan + tagihan `TERTUNDA`/`LUNAS`.
- Resep aktif tampil hanya bila tagihan masih `TERTUNDA` (join RME × billing) ([app/api/resep/route.ts:71-97](../app/api/resep/route.ts#L71-L97)).
- **Cetak invoice** pasien (window print) dengan rincian jasa dokter, obat, potongan, grand total.

#### F-1.7 Profil & BPJS
- Update `name`, `phoneNumber`, `nik`, `address`, `nomorBpjs`; validasi NIK ≤16 digit & telepon hanya angka ([app/api/profile/route.ts:38-56](../app/api/profile/route.ts#L38-L56)).
- **Aturan BPJS otomatis:** `nomorBpjs` 11–13 digit → `statusBpjs = Aktif`, selain itu `Non-Aktif` ([profile/route.ts:34-36](../app/api/profile/route.ts#L34-L36)). Status ini memicu potongan penuh di billing.

#### F-1.8 Notifikasi In-App
- Lonceng notifikasi + unread count; mendukung **pasien tamu** (via `guestIdDaftar`) ([app/api/notifikasi/route.ts:20-46](../app/api/notifikasi/route.ts#L20-L46)).
- Mark-as-read massal ([notifikasi/route.ts:48-77](../app/api/notifikasi/route.ts#L48-L77)).

### 5.2 Modul Staf Medis (`/medis` — [app/medis/page.tsx](../app/medis/page.tsx))

Satu halaman melayani dua persona berdasarkan email; Super Admin melihat keduanya.

#### F-2.1 Workstation Dokter — Antrean & Panggil Pasien
- Antrean aktif **difilter per nama dokter** yang login ([app/api/booking/route.ts:106-123](../app/api/booking/route.ts#L106-L123)); polling 5 dtk.
- `callPatient` → status `DIPANGGIL` + notifikasi "Antrean … dipanggil".
- `cancelPatientQueue` → modal alasan → status `BATAL` + notifikasi alasan ([medis/page.tsx:268](../app/medis/page.tsx#L268)).

#### F-2.2 Jadwal Praktek → Generator Slot
> *Sebagai dokter, saya ingin mengatur jam praktek agar slot booking pasien terbentuk otomatis.*
- Form Jam Mulai/Selesai/Kuota → `POST /api/jadwal` (upsert per dokter) ([app/api/jadwal/route.ts:71-125](../app/api/jadwal/route.ts#L71-L125)).
- `GET` menghasilkan **slot per 30 menit** dari rentang jadwal ([jadwal/route.ts:11-25](../app/api/jadwal/route.ts#L11-L25)).

#### F-2.3 Rekam Medis Elektronik + E-Prescription ⭐
> *Sebagai dokter, saya ingin menerbitkan resep digital yang otomatis membentuk tagihan.*

- Dokter memilih pasien dari antrean, mengisi SOAP/keluhan, diagnosa ICD-10, tindakan, dan **draft resep** (baris obat: nama/dosis/harga), opsi **rujuk VK** ([medis/page.tsx:299-371](../app/medis/page.tsx#L299-L371)).
- Submit → `POST /api/simulate-flow` menjalankan **satu transaksi** yang:
  1. Membuat akun `guest-<id>` bila pasien tamu ([simulate-flow/route.ts:117-145](../app/api/simulate-flow/route.ts#L117-L145)),
  2. Menyimpan RME (`statusResep = Diproses apotek`),
  3. Menghitung & menyimpan billing,
  4. Set antrean `SELESAI`,
  5. Kirim notifikasi "Resep siap diambil, tagihan tersedia",
  6. Jika rujuk VK & kamar ada → set kamar `Terisi` (`tipeMasuk = Rujukan Dokter`); jika penuh → `409 WardFull` ([simulate-flow/route.ts:91-113](../app/api/simulate-flow/route.ts#L91-L113)).

#### F-2.4 Workstation Perawat VK — Kontrol Kamar & Darurat
- Melihat **semua** antrean aktif + antrean darurat, menyelesaikan antrean darurat ([medis/page.tsx:421](../app/medis/page.tsx#L421)).
- `updateRoomStatus` → `PATCH /api/kamar`: ubah status kamar, dan **reset `idPasien`/`tipeMasuk`** saat kembali `Tersedia`; setiap perubahan menulis `log_aktivitas_vk` dengan `actorName` — **transaksional** ([app/api/kamar/route.ts:84-112](../app/api/kamar/route.ts#L84-L112)).
- Panel log aktivitas menampilkan 12 perubahan terakhir.

### 5.3 Modul Admin — Kasir & Farmasi (`/admin` — [app/admin/page.tsx](../app/admin/page.tsx))

#### F-3.1 Antrean Farmasi (Apoteker)
- Menampilkan RME berstatus `Diproses apotek` ([app/api/resep/route.ts:26-48](../app/api/resep/route.ts#L26-L48)).
- `completePrescription` → `PATCH /api/resep` set `Siap diambil` + notifikasi pasien/tamu "Resep sudah siap diambil" (transaksional) ([resep/route.ts:124-157](../app/api/resep/route.ts#L124-L157)).

#### F-3.2 Kasir — Konfirmasi Pembayaran
- Antrean tagihan `TERTUNDA` dengan rincian per pasien, nomor antrean, poli, metode bayar, obat ([app/api/billing/route.ts:65-104](../app/api/billing/route.ts#L65-L104)).
- `confirmPayment` → `PATCH /api/billing`: set `LUNAS` + `tglLunas`, **set antrean terkait `SELESAI`**, notifikasi nominal lunas — transaksional ([billing/route.ts:205-244](../app/api/billing/route.ts#L205-L244)).
- Cetak invoice pasien.

#### F-3.3 Ringkasan Pendapatan
- Filter periode **Hari ini / Minggu ini / Bulan ini** atas tagihan `LUNAS` (berdasarkan `tglLunas`), dengan agregat `SUM(grandTotal)` ([billing/route.ts:47-116](../app/api/billing/route.ts#L47-L116)).

#### F-3.4 Super Admin — Dual Dashboard
- `super_admin` melihat portal admin **dan** dapat beralih ke Dashboard Medis ([app/admin/page.tsx:159-160,454](../app/admin/page.tsx#L159-L160)).

### 5.4 Modul Staf Gateway (`/staff` — [app/staff/page.tsx](../app/staff/page.tsx))
- Login tunggal untuk seluruh staf; setelah autentikasi **redirect berbasis role** (`medis`→`/medis`, `admin`/`super_admin`→`/admin`); role `pasien` ditolak & di-*sign out* ([app/staff/page.tsx:33-81](../app/staff/page.tsx#L33-L81)).

---

## 6. Referensi API

Semua handler `runtime = "nodejs"`, memanggil `ensureDatabase()`, dan mem-*scope* data berdasarkan sesi/role.

| Endpoint | Method | Fungsi | Auth |
|---|---|---|---|
| `/api/auth/[...all]` | * | better-auth (signin/signup/session) | publik |
| `/api/booking` | GET | Antrean & riwayat (scoped per role; tamu via `?id_daftar`) | opsional |
| `/api/booking` | POST | Buat booking (+ guard antrean ganda) | opsional |
| `/api/booking` | PATCH | Ubah status / batal / arsip | login |
| `/api/kamar` | GET | Daftar kamar + ringkasan + log | publik |
| `/api/kamar` | PATCH | Ubah status kamar + audit log | medis/super_admin |
| `/api/jadwal` | GET | Jadwal + slot 30 menit | opsional |
| `/api/jadwal` | POST | Upsert jadwal praktek | medis/super_admin |
| `/api/simulate-flow` | POST | RME + billing (+ rujuk VK) transaksional | login |
| `/api/resep` | GET | Antrean farmasi / resep pasien | scoped |
| `/api/resep` | PATCH | Set "Siap diambil" | admin/super_admin |
| `/api/billing` | GET | Tagihan (scoped) + ringkasan pendapatan | scoped |
| `/api/billing` | PATCH | Konfirmasi LUNAS + set antrean SELESAI | admin/super_admin |
| `/api/emergency` | POST | Darurat maternal (reservasi kamar / fallback) | opsional |
| `/api/notifikasi` | GET/PATCH | Daftar & mark-read (user/tamu) | scoped |
| `/api/profile` | PATCH | Update profil + evaluasi BPJS | login |

**Konvensi error:** JSON `{ error, message }` dengan kode `400 ValidationError`, `401 Unauthorized`, `404 NotFound`, `409 ActiveBookingExists`/`WardFull`.

---

## 7. Aturan Bisnis Inti

### 7.1 Penomoran Antrean
- **Poli:** `A-` + `(jumlah pendaftaran pada tgl_kunjungan + 1)`, 4 digit ([booking/route.ts:221-227](../app/api/booking/route.ts#L221-L227)).
- **Darurat:** `EMG-` + `(jumlah keluhan "Darurat Melahirkan" + 1)`, 3 digit ([emergency/route.ts:46-54](../app/api/emergency/route.ts#L46-L54)).

### 7.2 Formula Billing ([simulate-flow/route.ts:19-53](../app/api/simulate-flow/route.ts#L19-L53))
```
biayaJasaDokter  = Rp 120.000  (konstanta)
biayaAdministrasi= Rp  50.000  (konstanta, masuk ke total)
biayaObat        = Σ (harga × qty) tiap item resep
total            = 120.000 + 50.000 + biayaObat
potonganAsuransi = (BPJS aktif) ? total : 0        // BPJS menanggung penuh
grandTotal       = max(total − potonganAsuransi, 0)
```
> BPJS aktif = `user.nomorBpjs` terisi **dan** `user.statusBpjs === "Aktif"`.

### 7.3 Siklus Status
- **Antrean:** `MENUNGGU` → `DIPANGGIL` → `SELESAI` (atau `BATAL`). Diset `SELESAI` otomatis saat RME dibuat (dokter) atau saat tagihan dilunasi (kasir).
- **Resep:** `Diproses apotek` → `Siap diambil`.
- **Tagihan:** `TERTUNDA` → `LUNAS` (+ `tglLunas`).
- **Kamar:** `Tersedia` ⇄ `Terisi` / `Sedang Dibersihkan` / `Tidak Aktif`; kembali `Tersedia` mereset penghuni.

### 7.4 Model Pasien Tamu (Guest)
Booking tanpa login menyimpan `userId = null`. Saat dokter memproses, dibuat akun bayangan `guest-<id_pendaftaran>` sehingga RME, billing, dan notifikasi tetap tertaut ([simulate-flow/route.ts:117-145](../app/api/simulate-flow/route.ts#L117-L145)). Notifikasi tamu memakai `guestIdDaftar`.

### 7.5 Integritas Transaksional
Alur multi-tabel (darurat, terbitkan resep, konfirmasi bayar, ubah kamar, ubah antrean) memakai `db.transaction(...)` agar atomik — tidak ada state setengah jadi.

---

## 8. Rekonstruksi Sprint (Reverse)

Riwayat git aktual memampatkan pengiriman ke **3 commit**. Di bawah, tiap commit dipetakan ke fase pengiriman, lalu diuraikan menjadi sprint logis yang mencerminkan pengelompokan fitur pada kode.

### Pemetaan Commit → Fase

| Commit | Judul | Fase |
|---|---|---|
| `5f4e17d` | *implement multi-role rbac with drizzle, sqlite, and better auth* | Fase 1 — Fondasi + seluruh modul inti |
| `231fa0e` | *add trixsehat logo across role navbars* | Fase 2 — Branding |
| `ec446e0` | *add scheduling bpjs billing and invoice workflows* | Fase 3 — Penjadwalan, BPJS, invoice |

### Sprint Logis (rekonstruksi fitur)

**Sprint 0 — Fondasi Platform** *(bagian dari `5f4e17d`)*
- Setup Next.js 15 + TypeScript + Tailwind + komponen `ui/*`.
- Drizzle + better-sqlite3; `ensureDatabase()` idempoten (create-if-not-exists, migrasi kolom, migrasi `pendaftaran` legacy).
- better-auth email/password + plugin username; field tambahan (role, nik, phone, BPJS).
- `middleware.ts` gerbang rute per role; seeding akun staf & data operasional.
- **DoD:** 4 role dapat login dan diarahkan ke halaman masing-masing.

**Sprint 1 — Booking Antrean Online (Pilar 1)** *(`5f4e17d`)*
- `pendaftaran` + `POST/GET/PATCH /api/booking`; penomoran `A-000X` per tanggal; guard antrean ganda (409).
- UI pasien: pilih poli→dokter→slot→metode bayar; tiket booking cetak; batal mandiri.
- Mode tamu (guest via `id_daftar` + localStorage).
- **DoD:** pasien login/tamu memperoleh nomor antrean; Front Office/dokter melihat antrean real-time (polling).

**Sprint 2 — Live Ward Tracker (Pilar 2)** *(`5f4e17d`)*
- `kamar_vk_rawat` + `log_aktivitas_vk`; `GET/PATCH /api/kamar`.
- Pasien: kartu status kamar (publik, polling 5 dtk).
- Perawat VK: ubah status ≤2 klik + audit log + reset penghuni saat `Tersedia`.
- **DoD:** perubahan Perawat VK tampil ke pasien ≤5 dtk; setiap perubahan tercatat di log.

**Sprint 3 — Alur Klinis & E-Prescription (Pilar 3)** *(`5f4e17d`)*
- `rekam_medis_elektronik` + `pembayaran_billing`; `POST /api/simulate-flow` transaksional (RME + billing + notifikasi + rujuk VK).
- Antrean farmasi `PATCH /api/resep`; kasir `PATCH /api/billing` (LUNAS + set antrean SELESAI).
- Dokter: panggil pasien, isi SOAP/ICD-10/tindakan, draft resep multi-baris.
- **DoD:** dari terbitkan resep → tagihan otomatis → farmasi → lunas berjalan end-to-end.

**Sprint 4 — Jalur Darurat Maternal** *(`5f4e17d`)*
- `POST /api/emergency`: `EMG-00X`, reservasi kamar otomatis, fallback `WardFull` (pengalihan ambulans).
- Modal darurat & modal kamar penuh di UI pasien.
- **DoD:** tombol darurat mengamankan kamar atau memberi instruksi rujukan.

**Sprint 5 — Notifikasi & Profil** *(`5f4e17d`)*
- `notifikasi` (user + tamu), unread count, mark-read.
- Manajemen profil + ganti password.
- **DoD:** setiap perubahan status penting memunculkan notifikasi in-app yang benar.

**Sprint 6 — Branding** *(`231fa0e`)*
- Logo TrixSehat + ikon di seluruh navbar keempat halaman.

**Sprint 7 — Penjadwalan, BPJS & Invoice** *(`ec446e0`)*
- `jadwal_dokter` + `GET/POST /api/jadwal`; generator slot 30 menit → mengisi pilihan jam booking.
- Kolom BPJS pada `user` + aturan aktif otomatis (11–13 digit) → potongan penuh di billing (`potonganAsuransi`, `grandTotal`).
- Kolom `tglLunas` + ringkasan pendapatan periode (hari/minggu/bulan) untuk kasir.
- Invoice cetak pasien & admin dengan rincian lengkap.
- **DoD:** jadwal dokter mengendalikan slot; pasien BPJS aktif memperoleh grandTotal Rp 0; kasir melihat rekap pendapatan berperiode.

---

## 9. Persyaratan Non-Fungsional (Aktual)

| Aspek | Implementasi Nyata |
|---|---|
| Real-time | **Polling SWR** — antrean & kamar `refreshInterval: 5000`, jadwal `10000` ([medis/page.tsx:196-210](../app/medis/page.tsx#L196-L210)). Bukan WebSocket. |
| Autentikasi | better-auth email/password, sesi berbasis cookie; password staf di-hash (`hashPassword`) ([db/init.ts:508](../db/init.ts#L508)). |
| Otorisasi | Ganda: middleware rute + cek `role` per handler. |
| Konsistensi data | Transaksi SQLite sinkron untuk operasi multi-tabel. |
| Skema evolusioner | `addColumnIfMissing` + migrasi tabel `pendaftaran` legacy tanpa kehilangan data. |
| Responsif | Tailwind, grid adaptif desktop/tablet/mobile. |
| Bahasa | Seluruh UI Bahasa Indonesia; mata uang `Intl.NumberFormat("id-ID", IDR)`. |
| Aksesibilitas warna | Badge status berkode warna (hijau/merah/kuning/abu). |

---

## 10. Batasan & Aspek Tersimulasi

Transparansi hal yang **belum production-grade** (sesuai catatan PoC pada PRD awal):

1. **Autentikasi pengembangan** — `BETTER_AUTH_SECRET` memiliki fallback default; akun staf diseed dengan password seragam `password123` ([db/init.ts:508](../db/init.ts#L508)). Wajib diganti sebelum produksi.
2. **Notifikasi = in-app saja** — tidak ada SMS/WhatsApp/push; pengingat H-1/1 jam belum ada.
3. **"Real-time" = polling** — bukan streaming; ada jeda hingga interval polling.
4. **Endpoint `simulate-flow`** — jalur pasien memakai resep tersimulasi (`SIMULATED_RESEP`) untuk demo, bukan input resep bebas dari pasien.
5. **Database lokal SQLite** — single-file embedded; belum ada replikasi/backup otomatis/cluster.
6. **Master data terbatas** — 5 poli, 7 dokter, 6 kamar "Kamar Rawat Umum" (bukan tipe VK/ICU/kelas terpisah); formularium obat tidak memiliki tabel stok terkuantifikasi (pemotongan stok bersifat status, belum numerik).
7. **2FA, enkripsi at-rest, laporan analitik lanjutan** — belum diimplementasikan.
8. **BPJS** — hanya simulasi status/potongan internal; belum ada integrasi VClaim.

---

## 11. Data Seed & Akun Uji

Diseed otomatis oleh [db/init.ts](../db/init.ts) (`seedStaffAccounts`, `seedOperationalData`). Password semua staf: **`password123`**.

| Nama | Email | Role | Persona |
|---|---|---|---|
| dr. Coralin Santoso, Sp.OG | dr.coralin@trixsehat.com | medis | Dokter Obgyn |
| dr. Lestari Ayuningtyas, Sp.OG | dr.lestari@trixsehat.com | medis | Dokter Obgyn |
| dr. Andi Anemon Wijaya, Sp.A | dr.andi@trixsehat.com | medis | Dokter Anak |
| dr. Ratna Puspita, Sp.A | dr.ratna@trixsehat.com | medis | Dokter Anak |
| dr. Bima Satriya, Sp.PD | dr.bima@trixsehat.com | medis | Penyakit Dalam |
| dr. Farhan Mahendra, Sp.B | dr.farhan@trixsehat.com | medis | Bedah Umum |
| drg. Dinda Maharani | drg.dinda@trixsehat.com | medis | Gigi & Mulut |
| Siti Kong | siti.vk@trixsehat.com | medis | Perawat VK |
| Admin Staff TrixSehat | admin@trixsehat.com | admin | Kasir/Apoteker |
| Budi Santoso, S.E. | budi.adm@trixsehat.com | admin | Kasir/Apoteker |
| Azka Sapling | azka.dirut@trixsehat.com | super_admin | Direksi |

**Poliklinik & pemetaan dokter** ([app/page.tsx:175-195](../app/page.tsx#L175-L195)): Obgyn (Coralin, Lestari) · Pediatrik (Andi, Ratna) · Penyakit Dalam (Bima) · Bedah Umum (Farhan) · Gigi & Mulut (Dinda).

**Data operasional:** 6× "Kamar Rawat Umum" (`Tersedia`), pasien demo *Nadia Putri*, dan 1 RME demo kontrol kehamilan trimester 3.

---

## 12. Roadmap Lanjutan

Kandidat pengembangan (mengangkat batasan Bagian 10 ke produksi):

- **Notifikasi kanal nyata** (WhatsApp/SMS/PWA push) + pengingat H-1 & 1 jam.
- **Real-time sejati** via SSE/WebSocket untuk antrean & ward tracker.
- **Manajemen stok apotek numerik** (kuantitas, low-stock alert, penerimaan barang) menggantikan pemotongan berbasis status.
- **Keamanan produksi:** 2FA untuk dokter/apoteker/kasir, enkripsi at-rest, audit trail penuh, rotasi secret.
- **Integrasi BPJS VClaim** menggantikan simulasi potongan internal.
- **Dashboard analitik manajemen** (KPI, DAU, waktu tunggu) untuk Direksi.
- **Migrasi database** dari SQLite embedded ke server (Postgres/Turso) + backup otomatis.
- **Tipe kamar lengkap** (VK, ICU, Kelas 1/2/3) + filter multi-dimensi pada tracker.
- **Modul laboratorium & radiologi**, telemedisin.

---

## 13. Glosarium

| Istilah | Definisi |
|---|---|
| HIS | Hospital Information System — sistem informasi rumah sakit |
| RBAC | Role-Based Access Control — otorisasi berbasis peran |
| RME | Rekam Medis Elektronik (`rekam_medis_elektronik`) |
| E-Prescription | Resep digital yang otomatis membentuk tagihan |
| VK (Verlos Kamer) | Ruang bersalin |
| Live Ward Tracker | Pemantauan ketersediaan kamar (tab "Status Kamar") |
| Guest / Tamu | Pasien tanpa akun; ditaut via `guestIdDaftar` / `guest-<id>` |
| SOAP | Subjective, Objective, Assessment, Plan (pola rekam medis) |
| ICD-10 | Standar klasifikasi diagnosa internasional |
| Grand Total | Tagihan akhir setelah potongan BPJS |

---

*Dokumen as-built ini merefleksikan keadaan kode pada commit `ec446e0` (branch `dithdyt/full-feature`). Setiap perubahan kode berikutnya harus disertai pembaruan dokumen ini agar tetap sinkron dengan implementasi.*

**Direkonstruksi oleh:** Tim Produk TrixSehat
**Terakhir diperbarui:** 09 Juli 2026
