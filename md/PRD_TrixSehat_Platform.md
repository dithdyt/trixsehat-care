# Product Requirements Document
## TrixSehat HIS Engine
### Integrated Hospital Information System — Booking, Ward Tracker & E-Prescription Platform

**Version** — 2.0 — Reverse-engineered dari kode produksi (branch `dithdyt/full-feature`, commit `ec446e0`)
**Owner** — Tim Produk TrixSehat
**Stakeholders** — RSU TrixSehat, Direksi, Dokter Spesialis, Perawat VK, Kasir & Apoteker, Pasien / Ibu Hamil
**Status** — As-Built — mencerminkan fitur yang benar-benar terpasang, diformat sebagai PRD build
**Key v2 traits** — Alur klinis end-to-end transaksional, RBAC 4-peran, E-Prescription → billing otomatis, BPJS auto-coverage, jalur darurat maternal auto-reservasi kamar
**AI Build Strategy** — Incremental sprints dirancang untuk AI-assisted development via Claude Code

> **Catatan.** Dokumen ini mereplikasi struktur PRD engineering (gaya *KA Wisata Wholesale Engine*) namun berisi konteks TrixSehat. Setiap klaim dapat ditelusuri ke berkas kode nyata (format `path:baris`). Dokumen pendamping: [PRD_TrixSehat.md](PRD_TrixSehat.md) (visi awal) dan [PRD_TrixSehat_AsBuilt.md](PRD_TrixSehat_AsBuilt.md) (as-built naratif).

---

## 1. Product Overview

TrixSehat HIS Engine adalah aplikasi web **Hospital Information System** yang mengintegrasikan seluruh alur layanan RSU — dari pendaftaran online hingga pelunasan tagihan — dalam satu aplikasi Next.js (App Router) dengan database SQLite embedded. Sistem menjalankan **rantai klinis satu arah yang saling memicu**: booking pasien menghasilkan antrean, pemeriksaan dokter menerbitkan Rekam Medis Elektronik + resep digital, resep otomatis membentuk tagihan, apotek menyiapkan obat, kasir melunasi, dan antrean ditutup.

**Alur inti:**
```
Booking Online → Antrean Poli → Dokter Panggil → RME + E-Resep →
Apotek (Siap diambil) → Tagihan Otomatis → Kasir (Lunas) → Selesai
```

### 1.1 Clinical Integrity Guarantee

Tidak seperti sistem RS manual, setiap transisi lintas-modul di TrixSehat dijalankan **atomik** — satu `db.transaction(...)` menjamin tidak ada state setengah jadi.

- Penerbitan resep membentuk **RME + tagihan + notifikasi** dalam satu transaksi ([app/api/simulate-flow/route.ts:116-238](../app/api/simulate-flow/route.ts#L116-L238)).
- Panggilan darurat maternal **mereservasi kamar + membuat antrean + notifikasi** atomik ([app/api/emergency/route.ts:45-86](../app/api/emergency/route.ts#L45-L86)).
- Konfirmasi pembayaran **melunasi tagihan + menutup antrean + notifikasi** atomik ([app/api/billing/route.ts:205-244](../app/api/billing/route.ts#L205-L244)).
- Aturan sistem: pasien tamu (tanpa akun) selalu di-*upgrade* ke akun bayangan `guest-<id>` saat diproses agar RME/tagihan tetap tertaut.

### 1.2 Core Principles

- **Terintegrasi penuh** — satu database menghubungkan pendaftaran, klinis, farmasi, dan keuangan; tidak ada input ulang antar-departemen.
- **RBAC ketat** — 4 peran ditegakkan ganda: level rute (`middleware.ts`) dan level handler API.
- **Transaksi atomik** — operasi multi-tabel sukses seluruhnya atau roll back.
- **Real-time via polling** — antrean & kamar disegarkan tiap 5 detik, jadwal tiap 10 detik (SWR `refreshInterval`).
- **Akses tamu (guest)** — booking & pemantauan kamar dapat dilakukan tanpa login, ditaut via `guestIdDaftar`.
- **BPJS auto-coverage** — nomor BPJS valid (11–13 digit) → status `Aktif` → potongan tagihan penuh otomatis.
- **Notifikasi in-app untuk setiap transisi** — pasien maupun tamu menerima pemberitahuan pada tiap perubahan status penting.
- **Darurat mengutamakan keselamatan** — panggilan darurat mereservasi kamar; bila penuh, sistem menginstruksikan rujukan ambulans.

### 1.3 System Actors

| Actor | Role (`user.role`) | Peran RS | Fungsi |
|---|---|---|---|
| **Pasien** | `pasien` | Ibu hamil / pasien umum / tamu | Booking antrean, pantau kamar, riwayat, tagihan, profil BPJS, panggilan darurat |
| **Staf Medis** | `medis` | Dokter Spesialis **&** Perawat VK | Kelola antrean, panggil pasien, atur jadwal praktek, terbitkan RME + E-Resep, kontrol status kamar |
| **Admin** | `admin` | Kasir **&** Apoteker | Antrean farmasi, konfirmasi pembayaran, ringkasan pendapatan |
| **Super Admin** | `super_admin` | Direksi (Dirut) | Superset admin **dan** medis; beralih antar-dashboard |

> Dokter vs Perawat VK berada dalam satu role `medis` namun dibedakan **berdasarkan email** (`doctorNameByEmail` menandai dokter; `siti.vk@trixsehat.com` menandai Perawat VK), bukan role terpisah ([app/medis/page.tsx:185-186](../app/medis/page.tsx#L185-L186)).

---

## 2. Service Lifecycle — Status Model

Empat entitas domain memiliki siklus status yang saling memicu. Memahami transisi ini esensial untuk semua pekerjaan pengembangan.

### 2.1 Booking / Antrean Status Flow

| Status | Deskripsi | Dipicu oleh |
|---|---|---|
| `MENUNGGU` | Antrean dibuat, menunggu dipanggil dokter | `POST /api/booking` |
| `DIPANGGIL` | Dokter memanggil pasien ke poli (atau darurat langsung) | `PATCH /api/booking` (callPatient) / `POST /api/emergency` |
| `SELESAI` | Pemeriksaan selesai (RME terbit) **atau** tagihan lunas | `POST /api/simulate-flow` / `PATCH /api/billing` |
| `BATAL` | Dibatalkan pasien atau dokter (dengan alasan) | `PATCH /api/booking` |

> `SELESAI` adalah state final. Antrean diset `SELESAI` otomatis oleh **dua** jalur: saat dokter menerbitkan RME, dan saat kasir melunasi tagihan terkait.

### 2.2 Resep & Tagihan Status Flow

| Entitas | Status | Deskripsi | Dipicu oleh |
|---|---|---|---|
| Resep (`statusResep`) | `Diproses apotek` | RME + resep terbit, masuk antrean farmasi | `POST /api/simulate-flow` |
| Resep (`statusResep`) | `Siap diambil` | Apoteker menyiapkan obat | `PATCH /api/resep` |
| Tagihan (`status`) | `TERTUNDA` | Tagihan terbentuk otomatis, menunggu kasir | `POST /api/simulate-flow` |
| Tagihan (`status`) | `LUNAS` | Kasir mengonfirmasi pembayaran (+`tglLunas`) | `PATCH /api/billing` |

### 2.3 Ward (Kamar) Status Flow

| Status | Warna UI | Keterangan | Efek |
|---|---|---|---|
| `Tersedia` | Hijau | Kamar siap digunakan | Reset `idPasien` & `tipeMasuk` |
| `Terisi` | Merah | Ditempati pasien | Set `idPasien`, `tipeMasuk` (`Pasien Darurat`\|`Rujukan Dokter`) |
| `Sedang Dibersihkan` | Kuning | Persiapan/pembersihan | — |
| `Tidak Aktif` | Abu-abu | Renovasi/rusak | — |

> Setiap perubahan status kamar menulis baris di `log_aktivitas_vk` dengan `actorName` — audit trail penuh ([app/api/kamar/route.ts:84-112](../app/api/kamar/route.ts#L84-L112)).

### 2.4 Two-Path Examination Flow

Pemeriksaan dapat dijalankan lewat **dua jalur** melalui endpoint yang sama (`POST /api/simulate-flow`):

| Jalur | Aktor | Input | Perilaku |
|---|---|---|---|
| **Dokter** | `medis` | `idPendaftaran` + SOAP + ICD-10 + resep draft | Memproses antrean spesifik; opsi rujuk VK; menaikkan tamu → `guest-<id>` |
| **Simulasi Pasien** | `pasien` | (antrean aktif sendiri) | Memakai `SIMULATED_RESEP` untuk demo alur end-to-end |

---

## 3. Billing Architecture

TrixSehat menghitung tagihan secara **deterministik** saat resep diterbitkan. Formula dan konstanta adalah sumber kebenaran tunggal di [app/api/simulate-flow/route.ts:19-53](../app/api/simulate-flow/route.ts#L19-L53).

### 3.1 Struktur Tagihan (`pembayaran_billing`)

| Field | Deskripsi | Contoh |
|---|---|---|
| `biayaJasaDokter` | Konstanta jasa dokter | Rp 120.000 |
| `biayaObat` | Σ (`harga` × `qty`) tiap item resep | dinamis |
| `total` | `jasaDokter + administrasi + obat` | — |
| `potonganAsuransi` | Potongan BPJS (penuh bila aktif) | 0 atau `total` |
| `grandTotal` | `max(total − potonganAsuransi, 0)` | tagihan akhir |
| `status` | `TERTUNDA` \| `LUNAS` | — |

### 3.2 Formula

```
biayaJasaDokter   = Rp 120.000               (konstanta BIAYA_JASA_DOKTER)
biayaAdministrasi = Rp  50.000               (konstanta, dilebur ke total)
biayaObat         = Σ (harga × qty)          (dari array resepObat)
total             = 120.000 + 50.000 + biayaObat
potonganAsuransi  = BPJS aktif ? total : 0   (BPJS menanggung penuh)
grandTotal        = max(total − potonganAsuransi, 0)
```

### 3.3 BPJS Coverage Tiering (analog fare tier)

Alih-alih tier harga, TrixSehat menerapkan **tier penanggungan** berdasarkan validitas BPJS pada profil pasien:

| Tier | Syarat | Efek pada grandTotal |
|---|---|---|
| **Non-BPJS / Mandiri** | `statusBpjs = Non-Aktif` | Bayar penuh (`grandTotal = total`) |
| **BPJS Aktif** | `nomorBpjs` 11–13 digit → `statusBpjs = Aktif` | Ditanggung penuh (`grandTotal = 0`) |

> Sistem menetapkan `statusBpjs` otomatis saat profil disimpan: 11–13 digit angka → `Aktif`, selain itu `Non-Aktif` ([app/api/profile/route.ts:34-36](../app/api/profile/route.ts#L34-L36)). BPJS aktif dievaluasi ulang saat billing dihitung ([simulate-flow/route.ts:149-160](../app/api/simulate-flow/route.ts#L149-L160)).

### 3.4 Penomoran Antrean

| Jenis | Format | Basis hitung |
|---|---|---|
| Poli reguler | `A-<4 digit>` (mis. `A-0007`) | Jumlah pendaftaran pada `tgl_kunjungan` + 1 |
| Darurat maternal | `EMG-<3 digit>` (mis. `EMG-002`) | Jumlah keluhan "Darurat Melahirkan" + 1 |

---

## 4. Feature List

17 fitur di seluruh 7 sprint. Semua fitur berstatus **Terpasang** (reverse dari kode). Kolom *Catatan* menandai kompleksitas atau integrasi lintas-modul.

| ID | Fitur | Sprint | Status |
|---|---|---|---|
| F-01 | Autentikasi email/password + RBAC 4-peran (better-auth) | Sprint 1 | Terpasang |
| F-02 | Bootstrap DB idempoten, migrasi kolom & seeding staf | Sprint 1 | Terpasang |
| F-03 | Middleware proteksi rute berbasis role | Sprint 1 | Terpasang |
| F-04 | Manajemen profil pasien + evaluasi BPJS otomatis | Sprint 2 | Terpasang |
| F-05 | Booking antrean online (+ guard antrean ganda, mode tamu) | Sprint 2 | Terpasang |
| F-06 | Jadwal praktek dokter → generator slot 30 menit | Sprint 2 | Terpasang |
| F-07 | Live Ward Tracker — status kamar publik (read) | Sprint 3 | Terpasang |
| F-08 | Kontrol status kamar + audit log (Perawat VK) | Sprint 3 | Terpasang |
| F-09 | Jalur darurat maternal (auto-reservasi kamar / fallback) | Sprint 3 | Terpasang |
| F-10 | Manajemen antrean poli & panggil pasien (dokter) | Sprint 4 | Terpasang |
| F-11 | Rekam Medis Elektronik (RME) + SOAP/ICD-10 | Sprint 4 | Terpasang |
| F-12 | E-Prescription → billing otomatis (transaksional) | Sprint 4 | Terpasang |
| F-13 | Antrean farmasi & penyiapan obat (apoteker) | Sprint 5 | Terpasang |
| F-14 | Konfirmasi pembayaran kasir + tutup antrean | Sprint 5 | Terpasang |
| F-15 | Ringkasan pendapatan berperiode (hari/minggu/bulan) | Sprint 5 | Terpasang |
| F-16 | Notifikasi in-app (pasien + tamu) + cetak invoice/tiket | Sprint 6 | Terpasang |
| F-17 | Portal staf, branding, dual dashboard super admin | Sprint 7 | Terpasang |

---

## 5. Feature Specifications

### F-01 — Autentikasi & RBAC

- `POST /api/auth/[...all]` — endpoint better-auth (signin, signup, get-session, signout).
- Email/password diaktifkan; plugin `username()` + `nextCookies()`; sesi berbasis cookie ([lib/auth.ts:12-62](../lib/auth.ts#L12-L62)).
- Kolom `role` (`pasien`\|`medis`\|`admin`\|`super_admin`) dengan `input: false` — tidak dapat diset klien.
- Field tambahan wajib saat daftar: `phoneNumber`, `nik`; opsional: `address`, `nomorBpjs`, `statusBpjs`.

> **Claude Code prompt hint:** Gunakan better-auth `drizzleAdapter` provider sqlite dengan `camelCase: true`. Jangan pernah percaya `role` dari input klien — set default `pasien` server-side dan promosikan role hanya lewat seeding.

### F-02 — Bootstrap DB & Seeding

`ensureDatabase()` dijalankan idempoten sekali per proses ([db/init.ts:15-197](../db/init.ts#L15-L197)):

- `CREATE TABLE IF NOT EXISTS` untuk 10 tabel domain + auth.
- `addColumnIfMissing()` untuk evolusi skema tanpa migrasi destruktif.
- `migratePendaftaranSchema()` — migrasi tabel `pendaftaran` legacy → skema baru dengan penyalinan data aman.
- `seedOperationalData()` — 6 "Kamar Rawat Umum", pasien demo *Nadia Putri*, RME demo.
- `seedStaffAccounts()` — 11 akun staf (password `password123`, di-hash).

### F-03 — Middleware Proteksi Rute

`middleware.ts` menjaga `/medis`, `/admin`, `/staff` ([middleware.ts:24-52](../middleware.ts#L24-L52)):

| Rute | Role diizinkan | Fallback |
|---|---|---|
| `/medis/*` | `medis`, `super_admin` | redirect `/` atau `/staff` |
| `/admin/*` | `admin`, `super_admin` | redirect `/` atau `/staff` |
| `/staff` | non-`pasien` | `pasien` → redirect `/` |

> **Claude Code prompt hint:** Middleware membaca role via `fetch('/api/auth/get-session')` dengan meneruskan cookie. Enforcement dobel — jangan andalkan middleware saja; setiap handler API harus mengecek role sendiri.

### F-04 — Profil Pasien & BPJS

`PATCH /api/profile` ([app/api/profile/route.ts:11-88](../app/api/profile/route.ts#L11-L88)):

| Field | Validasi |
|---|---|
| `name`, `phoneNumber`, `nik`, `address` | Wajib; telepon hanya angka; NIK ≤16 digit |
| `nomorBpjs` | Angka; 11–13 digit → `statusBpjs = Aktif` |

### F-05 — Booking Antrean Online

- `POST /api/booking` — buat antrean. Validasi **NIK minimal 8 karakter** (`400 ValidationError`).
- Guard antrean ganda: antrean aktif (`MENUNGGU`/`DIPANGGIL`) → `409 ActiveBookingExists`.
- Nomor antrean `A-<4 digit>` per tanggal; notifikasi "Booking berhasil dibuat".
- `GET /api/booking` — scoped per role (pasien: milik sendiri; dokter: per nama dokter; VK/admin/super_admin: semua).
- `PATCH /api/booking` — panggil/batal/arsip; tamu via `?id_daftar`.

| Field body | Keterangan |
|---|---|
| `nik` | Wajib, ≥8 karakter |
| `poliklinik`, `dokter`, `jamKunjungan` | Default Obgyn / dr. Coralin / 09:00 |
| `metodePembayaran` | `Mandiri` \| `BPJS` \| `Asuransi` |
| `keluhan`, `noAsuransi` | Opsional |

> **Claude Code prompt hint:** Booking tanpa sesi menyimpan `userId = null`; jangan tolak — dukung mode tamu dengan mengembalikan `id` pendaftaran untuk dilacak via `?id_daftar`.

### F-06 — Jadwal Praktek → Generator Slot

- `POST /api/jadwal` — upsert jadwal dokter (`jamMulai`, `jamSelesai`, `kuota`); hanya `medis`/`super_admin`.
- `GET /api/jadwal?dokter=<nama>` — kembalikan jadwal + **slot per 30 menit** hasil `createSlots()` ([app/api/jadwal/route.ts:11-25](../app/api/jadwal/route.ts#L11-L25)).
- Slot mengisi pilihan jam pada form booking pasien.

### F-07 — Live Ward Tracker (Read)

- `GET /api/kamar` — **publik**, kembalikan daftar kamar + `summary {total, available}` per jenis + 12 log terakhir ([app/api/kamar/route.ts:11-47](../app/api/kamar/route.ts#L11-L47)).
- UI pasien tab "Status Kamar" menampilkan kartu + badge warna, polling 5 dtk.

### F-08 — Kontrol Status Kamar + Audit Log

- `PATCH /api/kamar` — hanya `medis`/`super_admin`. Transaksi: update status + reset penghuni bila `Tersedia` + tulis `log_aktivitas_vk`.
- `actorName` = "Siti Kong" untuk Perawat VK, atau nama staf.

> **Claude Code prompt hint:** Saat status kembali `Tersedia`, WAJIB set `idPasien = null` dan `tipeMasuk = null`. Setiap perubahan menulis audit log dalam transaksi yang sama — jangan pisahkan.

### F-09 — Jalur Darurat Maternal

`POST /api/emergency` ([app/api/emergency/route.ts:11-87](../app/api/emergency/route.ts#L11-L87)):

- Cek "Kamar Rawat Umum" `Tersedia`. Bila ada → transaksi: buat antrean `EMG-<3 digit>` status `DIPANGGIL`, reservasi kamar (`Terisi`, `tipeMasuk = Pasien Darurat`), notifikasi ambulans.
- Bila penuh → `409 WardFull` dengan instruksi pengalihan ambulans ke RS rujukan.

### F-10 — Antrean Poli & Panggil Pasien

- Antrean dokter difilter per nama dokter yang login; polling 5 dtk.
- `callPatient` → `DIPANGGIL` + notifikasi. `cancelPatientQueue` → modal alasan → `BATAL` + notifikasi alasan.

### F-11 — Rekam Medis Elektronik

`rekam_medis_elektronik`: `keluhanUtama`, `diagnosaIcd10`, `tindakanMedis`, `resepObat` (JSON), `statusResep`. Terbit bersamaan dengan billing dalam satu transaksi.

### F-12 — E-Prescription → Billing Otomatis

`POST /api/simulate-flow` (jalur dokter) menjalankan satu transaksi ([simulate-flow/route.ts:116-238](../app/api/simulate-flow/route.ts#L116-L238)):

1. Naikkan pasien tamu → `guest-<id>` bila perlu.
2. Simpan RME (`statusResep = Diproses apotek`).
3. Hitung & simpan billing (formula §3.2, evaluasi BPJS).
4. Set antrean `SELESAI`.
5. Kirim notifikasi "Resep siap diambil, tagihan tersedia".
6. Opsi rujuk VK: kamar `Terisi` (`tipeMasuk = Rujukan Dokter`); bila penuh → `409 WardFull`.

> **Claude Code prompt hint:** Seluruh langkah 1–6 harus dalam SATU `db.transaction`. Cek ketersediaan kamar untuk rujuk VK SEBELUM transaksi (fail-fast) dan lagi DI DALAM transaksi (konsistensi).

### F-13 — Antrean Farmasi

- `GET /api/resep` (role admin) — RME `Diproses apotek`.
- `PATCH /api/resep` — set `Siap diambil` + notifikasi pasien/tamu "Resep sudah siap diambil" (transaksional).

### F-14 — Konfirmasi Pembayaran Kasir

- `GET /api/billing?status=TERTUNDA` — tagihan tertunda + detail pasien/poli/obat.
- `PATCH /api/billing` — transaksi: `LUNAS` + `tglLunas`, set antrean `SELESAI`, notifikasi nominal lunas.

### F-15 — Ringkasan Pendapatan

`GET /api/billing?status=LUNAS&period=<today|week|month>` — agregat `SUM(grandTotal)` atas `tglLunas` dalam periode ([app/api/billing/route.ts:47-116](../app/api/billing/route.ts#L47-L116)).

### F-16 — Notifikasi In-App & Cetak

- `GET/PATCH /api/notifikasi` — daftar + unread count + mark-read; dukung tamu via `guestIdDaftar`.
- Cetak tiket booking, tiket darurat, dan invoice pasien/admin via `window.print`.

### F-17 — Portal Staf, Branding & Dual Dashboard

- `/staff` — login tunggal, redirect berbasis role, tolak `pasien`.
- `super_admin` melihat portal admin + tombol beralih ke Dashboard Medis.
- Logo/ikon TrixSehat di seluruh navbar keempat halaman.

---

## 6. Notification Event Catalogue

TrixSehat memakai **notifikasi in-app** (bukan webhook) sebagai kanal event. Semua tersimpan di tabel `notifikasi` dan mendukung target `userId` atau `guestIdDaftar` (tamu). Disegarkan via polling.

| Event (pesan) | Dipicu ketika | Target |
|---|---|---|
| Booking antrean berhasil dibuat | `POST /api/booking` sukses | user / tamu |
| Antrean dipanggil ke poli | Dokter `callPatient` (`DIPANGGIL`) | user / tamu |
| Janji temu dibatalkan (+ alasan) | Dokter `PATCH /api/booking` (`BATAL`) | user / tamu |
| Antrean berhasil dibatalkan | Pasien batal mandiri | user / tamu |
| Darurat kebidanan aktif, ambulans OTW | `POST /api/emergency` | user / tamu |
| Resep siap diambil, tagihan tersedia | `POST /api/simulate-flow` | user / tamu |
| Resep obat sudah siap diambil di Apotek | `PATCH /api/resep` (`Siap diambil`) | user / tamu |
| Pembayaran telah lunas (nominal) | `PATCH /api/billing` (`LUNAS`) | user / tamu |
| Pemberitahuan pembatalan ditutup | Pasien acknowledge pembatalan | user / tamu |

> Notifikasi tamu menargetkan `guestIdDaftar` (id pendaftaran) selama pasien belum punya akun; setelah dinaikkan ke `guest-<id>`/akun, notifikasi menargetkan `userId`.

---

## 7. Key Data Model Entities

Skema di [db/schema.ts](../db/schema.ts). Timestamp `unixepoch()`.

| Entitas | Field kunci | Catatan |
|---|---|---|
| `user` | id, name, email(unik), role, username, phoneNumber, nik, address, nomorBpjs, statusBpjs | Profil + auth + BPJS |
| `session` | id, token(unik), expiresAt, userId | better-auth |
| `account` | id, providerId, password(hash), userId | Kredensial |
| `verification` | id, identifier, value, expiresAt | Token verifikasi |
| `pendaftaran` | id, nomorAntrean, nik, namaPasien, tglKunjungan, poliklinik, dokter, jamKunjungan, metodePembayaran, keluhan, alasanBatal, status, userId | Booking & antrean |
| `jadwalDokter` | id, dokterId, jamMulai, jamSelesai, kuota | Sumber generator slot |
| `rekamMedisElektronik` | idRme, userId, keluhanUtama, diagnosaIcd10, tindakanMedis, resepObat(JSON), statusResep | RME + E-Resep |
| `pembayaranBilling` | id, userId, idRme, idPendaftaran, biayaJasaDokter, biayaObat, total, potonganAsuransi, grandTotal, status, tglLunas | Tagihan otomatis |
| `kamarVkRawat` | idKamar, jenisKamar, status, idPasien, tipeMasuk | Ward tracker |
| `logAktivitasVk` | id, idKamar, status, actorName, createdAt | Audit trail kamar |
| `notifikasi` | id, userId, guestIdDaftar, pesan, tglNotif, isRead | Event in-app (user + tamu) |

**Relasi ringkas:**
```
user 1─┬─* pendaftaran ───────┐
       ├─* rekamMedis ────────┼─1 pembayaranBilling
       ├─* pembayaranBilling ─┘   (idPendaftaran / idRme)
       ├─* jadwalDokter
       ├─* kamarVkRawat (idPasien)
       └─* notifikasi
kamarVkRawat 1─* logAktivitasVk
```

---

## 8. Sprint Plan

7 sprint. Story point: 1 pt ≈ setengah hari kerja AI-assisted. Diformat untuk pengembangan inkremental via Claude Code.

> Feed PRD ini ke Claude Code di kickoff Sprint 1 dan minta generate skema database dulu (10 tabel domain + tabel better-auth). Konfirmasi skema sebelum kode aplikasi ditulis.

### Sprint 1 — Fondasi: Auth, RBAC & Bootstrap
**Goal:** 4 peran dapat login/daftar, diarahkan ke halaman masing-masing; database ter-bootstrap idempoten dengan akun staf terseed.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai pengunjung, saya dapat daftar sebagai pasien dengan NIK & no HP | Akun `pasien` dibuat; role di-set server-side; sesi cookie aktif | `POST /api/auth/[...all]` | 3 |
| Sebagai staf, saya login lewat gerbang tunggal dan diarahkan sesuai role | `medis`→`/medis`, `admin`/`super_admin`→`/admin`, `pasien` ditolak | `/staff` + middleware | 3 |
| Sistem bootstrap DB tanpa migrasi destruktif | Tabel `IF NOT EXISTS`; `addColumnIfMissing`; migrasi `pendaftaran` legacy aman | `ensureDatabase()` | 4 |
| 11 akun staf & data operasional terseed pada boot pertama | 7 dokter, 1 VK, 2 admin, 1 super admin (password hash); 6 kamar; pasien demo | `seedStaffAccounts` / `seedOperationalData` | 3 |
| Rute staf terproteksi per role | `/medis`,`/admin` menolak role tak berwenang; redirect benar | `middleware.ts` | 2 |

### Sprint 2 — Portal Pasien: Booking, Profil & Jadwal
**Goal:** Pasien (login/tamu) memesan antrean dengan poli/dokter/slot, mengelola profil + BPJS.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai pasien, saya booking antrean memilih poli, dokter, dan slot jam | Nomor `A-000X` per tanggal; slot dari jadwal dokter; tiket cetak | `POST /api/booking` | 5 |
| Booking ditolak bila saya sudah punya antrean aktif | `409 ActiveBookingExists` dengan data antrean berjalan | `POST /api/booking` | 2 |
| Sebagai tamu tanpa akun, saya tetap bisa booking & melacaknya | `userId=null`; dilacak via `?id_daftar` + localStorage | `GET/POST /api/booking` | 3 |
| Sebagai pasien, saya update profil dan BPJS saya | Validasi NIK/telepon; 11–13 digit → `statusBpjs=Aktif` | `PATCH /api/profile` | 3 |
| Sebagai dokter, saya atur jadwal praktek → slot booking otomatis | Upsert jadwal; `GET` hasilkan slot per 30 menit | `GET/POST /api/jadwal` | 3 |
| Sebagai pasien, saya membatalkan antrean aktif saya | Status `BATAL`, alasan tercatat, notifikasi terkirim | `PATCH /api/booking` | 2 |

### Sprint 3 — Live Ward Tracker & Jalur Darurat
**Goal:** Ketersediaan kamar terpantau real-time; Perawat VK mengontrol status; jalur darurat mengamankan kamar.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai pasien/publik, saya melihat status kamar tanpa login | Kartu + badge warna; `summary` per jenis; polling 5 dtk | `GET /api/kamar` | 3 |
| Sebagai Perawat VK, saya ubah status kamar ≤2 klik | Update status + reset penghuni saat `Tersedia`; audit log | `PATCH /api/kamar` | 4 |
| Setiap perubahan kamar tercatat untuk audit | Baris `log_aktivitas_vk` dengan `actorName`, dalam transaksi | `log_aktivitas_vk` | 2 |
| Sebagai pasien darurat, satu tombol mengamankan kamar & ambulans | `EMG-00X` + reservasi kamar `Terisi` + notifikasi, atomik | `POST /api/emergency` | 4 |
| Bila kamar penuh, sistem menginstruksikan rujukan ambulans | `409 WardFull` dengan pesan pengalihan RS rujukan | `POST /api/emergency` | 2 |

### Sprint 4 — Alur Klinis: Antrean, RME & E-Prescription
**Goal:** Dokter memanggil pasien, menerbitkan RME + resep digital yang otomatis membentuk tagihan.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai dokter, saya melihat antrean aktif poli saya | Difilter per nama dokter; polling 5 dtk | `GET /api/booking` | 3 |
| Sebagai dokter, saya memanggil / membatalkan pasien | `DIPANGGIL` / `BATAL` + alasan + notifikasi | `PATCH /api/booking` | 3 |
| Sebagai dokter, saya menerbitkan RME + resep digital | RME `Diproses apotek`; billing otomatis; antrean `SELESAI` — satu transaksi | `POST /api/simulate-flow` | 5 |
| Tagihan dihitung dengan formula & potongan BPJS benar | jasa 120k + admin 50k + obat; BPJS aktif → grandTotal 0 | `calculateBillingTotals` | 3 |
| Sebagai dokter, saya merujuk pasien ke kamar rawat | Kamar `Terisi` (`Rujukan Dokter`); penuh → `409 WardFull` | `POST /api/simulate-flow` | 2 |
| Pasien tamu dinaikkan ke akun bayangan saat diproses | `guest-<id>` dibuat; RME/tagihan/notifikasi tertaut | `POST /api/simulate-flow` | 2 |

### Sprint 5 — Modul Admin: Farmasi, Kasir & Pendapatan
**Goal:** Apoteker menyiapkan resep; kasir melunasi tagihan; ringkasan pendapatan berperiode tersedia.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai apoteker, saya melihat & menyiapkan antrean resep | RME `Diproses apotek` → `Siap diambil` + notifikasi | `GET/PATCH /api/resep` | 4 |
| Sebagai kasir, saya melihat tagihan tertunda pasien | Detail pasien/poli/metode/obat; nominal grandTotal | `GET /api/billing` | 3 |
| Sebagai kasir, saya konfirmasi pembayaran | `LUNAS` + `tglLunas`; antrean `SELESAI`; notifikasi — atomik | `PATCH /api/billing` | 4 |
| Sebagai kasir, saya melihat ringkasan pendapatan berperiode | Filter today/week/month; `SUM(grandTotal)` atas `tglLunas` | `GET /api/billing?period=` | 3 |
| Sebagai admin, saya mencetak invoice pasien | Rincian jasa/obat/potongan/grandTotal via print | Komponen invoice | 2 |

### Sprint 6 — Notifikasi, Riwayat & Cetak
**Goal:** Setiap transisi memunculkan notifikasi in-app (user & tamu); pasien melihat riwayat, resep, dan mencetak.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai pasien/tamu, saya menerima notifikasi tiap status berubah | Pesan benar; unread count; mark-read massal | `GET/PATCH /api/notifikasi` | 3 |
| Sebagai pasien, saya melihat riwayat kunjungan & tagihan | Gabungan riwayat + tagihan `TERTUNDA`/`LUNAS` | Tab Riwayat + `GET /api/billing` | 3 |
| Resep aktif tampil hanya bila tagihan masih tertunda | Join RME × billing (`TERTUNDA`) | `GET /api/resep` | 2 |
| Sebagai pasien, saya mencetak tiket booking & invoice | Modal cetak dengan detail lengkap | Komponen cetak | 2 |
| Notifikasi tamu tetap tertaut sebelum punya akun | Target `guestIdDaftar`; beralih ke `userId` setelah dinaikkan | `notifikasi` | 2 |

### Sprint 7 — Portal Staf, Branding & Polish
**Goal:** Gerbang staf, branding konsisten, dan dual-dashboard super admin production-ready.

| User story | Acceptance criteria | API / komponen | Pts |
|---|---|---|---|
| Sebagai Direksi, saya mengakses portal admin & beralih ke medis | `super_admin` superset; tombol beralih dashboard | `/admin` + `/medis` | 4 |
| Sebagai staf, gerbang login menolak akses pasien | `pasien` di-signout + pesan "Akses ditolak" | `/staff` | 2 |
| Branding TrixSehat konsisten di semua navbar | Logo/ikon di 4 halaman | Navbar komponen | 2 |
| Antrean & kamar tersegarkan real-time | SWR `refreshInterval` 5 dtk (antrean/kamar), 10 dtk (jadwal) | SWR hooks | 3 |
| Alur end-to-end teruji: booking → resep → farmasi → lunas | Happy path + edge (antrean ganda, kamar penuh, BPJS) | Uji integrasi | 5 |

---

## 9. Non-Functional Requirements

### 9.1 Performa
- Portal pasien load < 3 detik pada 4G.
- Status antrean & kamar tersegarkan ≤ 5 detik (SWR polling); jadwal ≤ 10 detik.
- Operasi klinis (terbitkan resep, konfirmasi bayar) diselesaikan dalam satu transaksi SQLite sinkron.

### 9.2 Keamanan
- Password staf di-hash (`better-auth/crypto hashPassword`); sesi berbasis cookie.
- Otorisasi ganda: `middleware.ts` (rute) + cek `role` per handler.
- `role` `input: false` — tidak dapat diset klien.
- **Catatan pengembangan:** `BETTER_AUTH_SECRET` memiliki fallback default dan akun staf memakai `password123` — WAJIB diganti sebelum produksi.

### 9.3 Reliabilitas
- Operasi multi-tabel memakai `db.transaction(...)` — atomik, tanpa state parsial.
- Bootstrap DB idempoten; migrasi kolom & tabel legacy non-destruktif.
- Guard antrean ganda mencegah duplikasi pendaftaran aktif.
- Reservasi kamar darurat/rujukan mengecek ketersediaan fail-fast sebelum transaksi.

### 9.4 Observabilitas & Audit
- `log_aktivitas_vk` mencatat setiap perubahan status kamar dengan aktor & timestamp.
- `notifikasi` menyimpan jejak seluruh event yang dikirim ke pasien/tamu.
- `tglLunas` menyimpan waktu pelunasan untuk laporan pendapatan berperiode.

### 9.5 Usabilitas
- UI Bahasa Indonesia; mata uang `Intl.NumberFormat("id-ID", IDR)`.
- Responsif desktop/tablet/mobile (Tailwind grid).
- Badge status berkode warna (hijau/merah/kuning/abu).

---

## 10. Open Questions

| # | Topik | Pertanyaan | Default disarankan |
|---|---|---|---|
| Q1 | Kanal notifikasi | Apakah perlu SMS/WhatsApp/push selain in-app? | In-app dulu; WA/push sebagai roadmap |
| Q2 | Real-time | Polling cukup atau perlu SSE/WebSocket untuk ward tracker? | Polling untuk v2; SSE bila skala naik |
| Q3 | Stok obat | Apakah pemotongan stok harus numerik (bukan status)? | Numerik + low-stock alert sebagai roadmap |
| Q4 | Integrasi BPJS | Perlu VClaim API nyata atau cukup simulasi potongan internal? | Simulasi v2; VClaim v3 |
| Q5 | Database | Tetap SQLite embedded atau migrasi ke server (Postgres/Turso)? | Server-DB + backup otomatis sebelum produksi |
| Q6 | Tipe kamar | Perlu tipe VK/ICU/Kelas 1-2-3 terpisah? | Ya, perluasan master data |
| Q7 | Keamanan | 2FA & enkripsi at-rest untuk data medis? | Wajib sebelum go-live produksi |
| Q8 | Resep pasien | Jalur `simulate-flow` pasien memakai resep tersimulasi — hapus untuk produksi? | Batasi ke demo; produksi hanya jalur dokter |
| Q9 | Formularium | Perlu tabel obat/formularium terkelola? | Ya, gantikan array resep hardcoded |
| Q10 | Analitik | Perlu dashboard KPI/DAU untuk Direksi? | Roadmap Sprint lanjutan |

---

## 11. Claude Code Prompting Guide

PRD ini terstruktur untuk pengembangan inkremental AI-assisted. Gunakan pendekatan berikut per sprint.

### Template prompt kickoff sprint

> Anda membangun **TrixSehat HIS Engine** — Hospital Information System web dengan alur klinis terintegrasi (booking → antrean → RME + E-Resep → billing otomatis → farmasi → kasir) dan RBAC 4-peran. Berikut skema database terkonfirmasi: [paste skema]. Berikut bagian PRD untuk [NAMA FITUR]: [paste bagian]. Bangun implementasi inkremental: mulai dari skema Drizzle & route handler, lalu UI, lalu verifikasi alur end-to-end. Tandai ambiguitas sebelum coding.

### Konteks kritis yang selalu disertakan

- **Alur klinis atomik** — operasi multi-tabel (resep, darurat, pembayaran, kamar) WAJIB dalam satu `db.transaction`.
- **RBAC ganda** — enforcement di `middleware.ts` DAN cek `role` per handler; `role` tak pernah dari input klien.
- **Formula billing** — jasa 120k + admin 50k + Σ(harga×qty); BPJS aktif (11–13 digit) → grandTotal 0.
- **Mode tamu** — booking tanpa akun (`userId=null`), dinaikkan ke `guest-<id>` saat diproses dokter.
- **Real-time = polling** — SWR `refreshInterval` (antrean/kamar 5 dtk, jadwal 10 dtk), bukan WebSocket.
- **Ward tracker** — status kembali `Tersedia` mereset `idPasien`/`tipeMasuk`; setiap perubahan menulis audit log.

### Tech stack (aktual)

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC + Route Handlers) | UI + API satu proyek |
| Runtime UI | React 19 | — |
| Bahasa | TypeScript 5.7 | — |
| Styling | Tailwind CSS + `class-variance-authority` + pola shadcn/ui | `components/ui/*` |
| Ikon | `lucide-react` | — |
| ORM | Drizzle ORM + Drizzle Kit | skema `db/schema.ts` |
| Database | SQLite via `better-sqlite3` (embedded, sinkron) | transaksi ACID untuk atomicity |
| Auth | `better-auth` (email/password + plugin `username`, `nextCookies`) | `drizzleAdapter` sqlite |
| Fetch klien | SWR (`refreshInterval` untuk polling) | pengganti real-time |
| Runtime API | Node.js (`runtime = "nodejs"`) | semua route handler |

> Mulai Sprint 1 dengan memberi Claude Code seluruh PRD ini dan minta generate skema Drizzle untuk 10 tabel domain (+ tabel better-auth) beserta fungsi `ensureDatabase()` idempoten dan seeding staf. Review & konfirmasi skema sebelum kode aplikasi ditulis. Semua sprint berikutnya merujuk skema terkonfirmasi.

---

*Dokumen as-built ini merefleksikan kode pada commit `ec446e0` (branch `dithdyt/full-feature`). Perubahan kode berikutnya harus disertai pembaruan dokumen agar tetap sinkron dengan implementasi.*

**Direkonstruksi oleh:** Tim Produk TrixSehat · **Terakhir diperbarui:** 09 Juli 2026
