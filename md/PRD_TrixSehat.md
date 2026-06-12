# Product Requirements Document (PRD)
## TrixSehat — Sistem Informasi Rumah Sakit Terintegrasi

---

**Versi Dokumen:** 1.0  
**Tanggal:** 09 Juni 2026  
**Status:** Draft  
**Pemilik Produk:** Tim TrixSehat  

---

## 1. Executive Summary

TrixSehat adalah aplikasi web Sistem Informasi Rumah Sakit (SIRH) berbasis cloud yang menghubungkan seluruh alur layanan medis — dari pendaftaran pasien hingga pembayaran — dalam satu platform terpusat dan real-time. Produk ini hadir untuk menghilangkan hambatan utama yang dialami pasien: antrean fisik yang panjang, ketidakpastian ketersediaan kamar, dan proses resep serta penagihan yang lambat dan manual.

Tiga pilar utama TrixSehat:
1. **Booking Antrean Online** — pasien mendaftar dari rumah, tiba sudah punya nomor antrean.
2. **Live Ward Tracker** — status ketersediaan kamar bersalin & rawat inap dapat dipantau kapan saja, secara real-time.
3. **E-Prescription** — resep dokter otomatis memotong stok apotek dan langsung masuk ke tagihan kasir.

---

## 2. Latar Belakang & Problem Statement

### 2.1 Konteks

Rumah sakit yang masih beroperasi secara manual menghadapi tantangan serius: pasien harus hadir secara fisik untuk mendaftar, antrean loket yang panjang membuang waktu, dan informasi ketersediaan kamar tidak bisa diakses dari luar gedung. Hal ini sangat berbahaya bagi ibu hamil dalam kondisi mendesak yang baru mengetahui kamar bersalin penuh setelah tiba di lokasi.

### 2.2 Target Pengguna yang Paling Terdampak

**Pasien Utama:** Ibu hamil dan pasien umum yang membutuhkan kepastian layanan medis dengan cepat. Saat ini, mereka harus datang langsung secara fisik ke rumah sakit, mengantre lama di loket pendaftaran, dan seringkali baru mengetahui bahwa kamar bersalin atau ruang rawat inap sudah penuh setelah tiba di lokasi — yang mana sangat berisiko saat kondisi darurat.

### 2.3 Root Cause

| Masalah | Dampak |
|---|---|
| Pendaftaran hanya bisa dilakukan di loket fisik | Antrean panjang, pasien membuang waktu perjalanan sia-sia |
| Tidak ada visibilitas ketersediaan kamar dari luar RS | Risiko tinggi bagi ibu hamil & pasien darurat |
| Resep dokter dicatat manual, apotek & kasir terpisah | Proses lambat, potensi error stok & tagihan |
| Data tidak terintegrasi antar departemen | Duplikasi kerja, keterlambatan pelayanan |

---

## 3. Tujuan Produk

### 3.1 Tujuan Bisnis
- Meningkatkan efisiensi operasional rumah sakit dengan mengurangi beban kerja manual di seluruh departemen.
- Mempercepat alur pelayanan pasien dari pendaftaran hingga pembayaran.
- Mengurangi risiko medis akibat keterlambatan informasi ketersediaan kamar.

### 3.2 Tujuan Pengguna
- Pasien dapat melakukan booking antrean dari mana saja tanpa harus datang ke RS.
- Pasien & keluarga dapat memantau ketersediaan kamar secara real-time sebelum berangkat.
- Dokter, perawat, apoteker, dan kasir bekerja dari satu sistem yang saling terhubung.

### 3.3 Metrik Keberhasilan (Key Metrics)

| Metrik | Target (6 Bulan) |
|---|---|
| % pasien yang booking via aplikasi | ≥ 60% |
| Rata-rata waktu tunggu antrean pendaftaran | Turun ≥ 50% |
| Akurasi stok apotek setelah E-Prescription | ≥ 99% |
| Daily Active Users (DAU) dari fitur Live Ward Tracker | ≥ 40% dari total pengguna terdaftar |
| Waktu dari resep dokter ke tagihan kasir | < 2 menit |

---

## 4. Pengguna & Peran (RBAC)

TrixSehat menggunakan Role-Based Access Control (RBAC) dengan 6 peran berikut:

| Peran | Deskripsi Singkat | Akses Utama |
|---|---|---|
| **Pasien** | Pengguna akhir — ibu hamil, pasien umum | Booking antrean, Live Ward Tracker, riwayat kunjungan, tagihan |
| **Front Office** | Staff pendaftaran & penerimaan pasien | Manajemen antrean, verifikasi data pasien, rekam medis dasar |
| **Perawat VK** | Perawat di ruang bersalin (Verlos Kamer) | Update status kamar, input tindakan keperawatan |
| **Dokter** | Dokter spesialis & umum | Rekam medis, diagnosis, penerbitan E-Prescription |
| **Apoteker** | Staf apotek | Verifikasi & pengeluaran resep, manajemen stok obat |
| **Kasir** | Staf keuangan | Manajemen tagihan, pembayaran, laporan keuangan |

Catatan untuk MVP Development: Untuk keperluan Proof of Concept (PoC), RBAC disederhanakan menjadi 3 role utama: 1. Pasien, 2. Staf Medis (gabungan Dokter/Perawat VK), dan 3. Admin (gabungan Front Office/Apoteker/Kasir).

---

## 5. Fitur Produk

### 5.1 Fitur Inti (Must Have — P0)

#### 5.1.1 Booking Antrean Online ⭐

**Deskripsi:** Pasien dapat mendaftar dan memesan nomor antrean untuk poli atau layanan tertentu melalui aplikasi web, tanpa harus datang ke loket.

**User Story:**
> *Sebagai pasien, saya ingin bisa mendaftar antrean secara online agar saat tiba di RS, saya langsung bisa dilayani tanpa mengantre panjang.*

**Kriteria Penerimaan (Acceptance Criteria):**
- Pasien dapat membuat akun dengan NIK, nama, nomor HP, dan tanggal lahir.
- Pasien dapat memilih poli/layanan, dokter, dan slot waktu yang tersedia.
- Sistem menghasilkan nomor antrean unik yang bisa ditampilkan di layar atau dicetak.
- Notifikasi pengingat dikirim via SMS/WhatsApp H-1 dan 1 jam sebelum jadwal, untuk sementara Notifikasi pengingat berupa In-App Notification (Simulasi UI).
- Pasien dapat membatalkan atau menjadwal ulang antrean minimal 2 jam sebelum waktu.
- Front Office dapat melihat dan memvalidasi antrean yang masuk secara real-time.

**Alur Utama:**
```
Pasien daftar akun → Pilih layanan & jadwal → Konfirmasi booking → 
Terima nomor antrean → Tiba di RS → Konfirmasi kedatangan di kios/front office → Dilayani
```

---


#### 5.1.2 Live Ward Tracker ⭐

**Deskripsi:** Dashboard real-time yang menampilkan status ketersediaan kamar bersalin (VK) dan rawat inap, dapat diakses oleh pasien dan staf medis kapan saja.

**User Story:**
> *Sebagai ibu hamil, saya ingin tahu apakah kamar bersalin tersedia sebelum berangkat ke RS, agar saya tidak sia-sia datang jauh-jauh saat kondisi mendesak.*

**Kriteria Penerimaan:**
- Tampilan visual (card/grid) untuk setiap kamar dengan status: **Tersedia**, **Terisi**, **Sedang Dibersihkan**, **Tidak Aktif**.
- Status diperbarui secara real-time (≤ 30 detik delay) ketika Perawat VK mengubah kondisi kamar.
- Pasien dapat melihat jumlah kamar tersedia tanpa perlu login (akses publik terbatas).
- Filter berdasarkan: tipe kamar (VK, Kelas 1/2/3, ICU), lantai, dan gedung.
- Riwayat perubahan status kamar tersimpan untuk keperluan audit dan pelaporan.
- Perawat VK dapat mengubah status kamar melalui antarmuka yang sederhana (maks. 2 klik).

**Status Kamar:**

| Status | Warna | Keterangan |
|---|---|---|
| Tersedia | Hijau | Kamar siap digunakan |
| Terisi | Merah | Sedang ditempati pasien |
| Sedang Dibersihkan | Kuning | Dalam proses persiapan |
| Tidak Aktif | Abu-abu | Tidak dapat digunakan (renovasi/rusak) |

---

#### 5.1.3 E-Prescription (Resep Elektronik) ⭐

**Deskripsi:** Dokter menerbitkan resep secara digital yang secara otomatis memotong stok di apotek dan menambahkan item ke tagihan kasir — tanpa kertas, tanpa input ulang.

**User Story:**
> *Sebagai dokter, saya ingin menerbitkan resep digital agar pasien tidak perlu menunggu lama di apotek dan tagihan otomatis terbentuk tanpa saya harus menulis ulang.*

**Kriteria Penerimaan:**
- Dokter dapat mencari obat berdasarkan nama generik/merek dari database formularium RS.
- Sistem menampilkan stok obat saat ini secara real-time saat dokter membuat resep.
- Setelah resep diterbitkan, stok apotek otomatis berkurang (status: **pending pengambilan**).
- Harga obat otomatis ditambahkan ke tagihan pasien di modul kasir.
- Apoteker menerima notifikasi resep baru dengan detail lengkap (obat, dosis, frekuensi, jumlah).
- Pasien dapat melihat detail resep dan estimasi biaya di portal pasien.
- Sistem memperingatkan dokter jika stok obat tidak mencukupi atau habis.
- Riwayat resep tersimpan di rekam medis pasien.

**Alur Integrasi E-Prescription:**
```
Dokter buka rekam medis → Input diagnosis → Tambah resep digital →
Stok apotek berkurang otomatis → Item masuk tagihan kasir →
Apoteker siapkan obat → Kasir proses pembayaran → Pasien ambil obat & bayar
```

---

### 5.2 Fitur Pendukung (Should Have — P1)

#### 5.2.1 Portal Pasien
- Riwayat kunjungan dan rekam medis ringkas.
- Riwayat resep dan tagihan.
- Profil dan data pribadi yang dapat diperbarui.
- Notifikasi status antrean (estimasi waktu tunggu).

#### 5.2.2 Manajemen Rekam Medis
- Input SOAP (Subjective, Objective, Assessment, Plan) oleh dokter.
- Riwayat diagnosis dan tindakan medis.
- Integrasi dengan E-Prescription.

#### 5.2.3 Manajemen Stok Apotek
- Dashboard stok obat real-time.
- Peringatan stok minimum (low stock alert).
- Laporan pengeluaran obat harian/bulanan.
- Input penerimaan stok baru.

#### 5.2.4 Modul Kasir & Tagihan
- Akumulasi tagihan otomatis dari: tindakan medis, obat (E-Prescription), laboratorium.
- Dukungan pembayaran: tunai, kartu debit/kredit, BPJS/asuransi.
- Cetak kwitansi dan invoice digital.
- Laporan keuangan harian.

---

### 5.3 Fitur Masa Depan (Nice to Have — P2)

- Integrasi BPJS Kesehatan (VClaim API).
- Telemedisin / konsultasi online.
- Notifikasi push mobile (PWA atau aplikasi native).
- Modul laboratorium & radiologi.
- Dashboard manajemen RS (analytics & KPI).
- Integrasi dengan alat medis IoT (seperti monitor pasien).

---

## 6. Persyaratan Non-Fungsional

### 6.1 Performa
- Halaman utama portal pasien harus load dalam ≤ 3 detik pada koneksi 4G.
- Live Ward Tracker harus memperbarui status dalam ≤ 30 detik setelah perubahan dilakukan.
- Sistem harus mendukung minimal 200 pengguna bersamaan tanpa degradasi performa.

### 6.2 Keamanan
- Seluruh data ditransmisikan via HTTPS (TLS 1.2+).
- Data rekam medis dienkripsi saat disimpan (at-rest encryption).
- Implementasi RBAC yang ketat — setiap peran hanya dapat mengakses data yang relevan.
- Autentikasi dua faktor (2FA) wajib untuk peran Dokter, Apoteker, dan Kasir.
- Log aktivitas (audit trail) untuk semua perubahan data sensitif.
- Kepatuhan terhadap regulasi privasi data kesehatan yang berlaku di Indonesia.
- Keamanan MVP: Menggunakan simulasi autentikasi sederhana (dummy login) berbasis Session/LocalStorage.

### 6.3 Ketersediaan & Reliabilitas
- Uptime minimal 99.5% (tidak lebih dari 3.6 jam downtime per bulan).
- Backup data otomatis setiap 24 jam.
- Rencana pemulihan bencana (disaster recovery) dengan RTO ≤ 4 jam.

### 6.4 Skalabilitas
- Arsitektur harus mendukung penambahan cabang RS baru tanpa perubahan kode besar.
- Database harus mampu menyimpan rekam medis minimal 100.000 pasien.

### 6.5 Aksesibilitas & Usabilitas
- Antarmuka responsif — berfungsi di desktop, tablet, dan browser mobile.
- Bahasa antarmuka: Bahasa Indonesia.
- Pasien baru harus bisa berhasil melakukan booking antrean pertama tanpa bantuan, dalam ≤ 5 menit.

---

## 7. Alur Sistem & Integrasi Antar Modul

```
┌─────────────────────────────────────────────────────────┐
│                    PORTAL PASIEN                        │
│   Registrasi → Booking Antrean → Live Ward Tracker      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  FRONT OFFICE                           │
│   Verifikasi Kedatangan → Buka Rekam Medis              │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  DOKTER  │ │ PERAWAT  │ │   VK /   │
    │ Rekam    │ │   VK     │ │  KAMAR   │
    │ Medis +  │ │ Update   │ │ Tracker  │
    │ E-Resep  │ │ Status   │ └──────────┘
    └────┬─────┘ └──────────┘
         │
    ┌────▼─────┐
    │ APOTEKER │
    │ Stok &   │
    │ Racik    │
    └────┬─────┘
         │
    ┌────▼─────┐
    │  KASIR   │
    │ Tagihan  │
    │ & Bayar  │
    └──────────┘
```

---

## 8. Definisi Done (Definition of Done)

Sebuah fitur dianggap selesai apabila:
- [ ] Semua acceptance criteria telah terpenuhi dan diverifikasi oleh QA.
- [ ] Pengujian unit test dengan coverage ≥ 80%.
- [ ] Pengujian integrasi antar modul yang terpengaruh telah dilakukan.
- [ ] Pengujian di browser: Chrome, Firefox, dan Safari (versi terkini).
- [ ] Pengujian performa memenuhi standar yang ditentukan di Bagian 6.
- [ ] Dokumentasi teknis dan panduan pengguna (user guide) telah dibuat.
- [ ] Tidak ada bug kritikal (severity 1) yang terbuka.
- [ ] Disetujui oleh Product Owner.

---

## 9. Asumsi & Batasan

### Asumsi
- Rumah sakit memiliki koneksi internet yang stabil dan memadai.
- Staf medis akan mendapatkan pelatihan penggunaan sistem sebelum go-live.
- Data master (obat, kamar, jadwal dokter) tersedia dan dapat dimigrasikan dari sistem lama.

### Batasan (Out of Scope v1.0)
- Integrasi langsung dengan BPJS VClaim API (dijadwalkan v2.0).
- Fitur telemedisin / konsultasi video.
- Aplikasi mobile native (iOS/Android) — v1.0 hanya web responsif.
- Modul laboratorium dan radiologi.

---

## 10. Risiko & Mitigasi

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Resistensi staf terhadap sistem baru | Tinggi | Tinggi | Pelatihan intensif, onboarding bertahap per departemen |
| Gangguan internet di RS | Sedang | Tinggi | Mode offline terbatas untuk pencatatan darurat, sinkronisasi saat koneksi pulih |
| Migrasi data dari sistem lama bermasalah | Sedang | Tinggi | Audit data sebelum migrasi, periode parallel run 2 minggu |
| Stok obat tidak akurat akibat input manual sebelumnya | Tinggi | Sedang | Stock opname wajib sebelum go-live modul E-Prescription |
| Keamanan data pasien | Rendah | Sangat Tinggi | Enkripsi, audit trail, penetration testing pra-launch |

---

## 11. Rencana Rilis (Phased Rollout)

### Phase 1 — MVP (Bulan 1–3)
**Fokus:** Pasien bisa daftar, booking, dan Front Office bisa kelola antrean.
- Registrasi & login pasien
- Booking antrean online
- Dashboard Front Office
- Live Ward Tracker (read-only untuk pasien)

### Phase 2 — Core Clinical (Bulan 4–6)
**Fokus:** Alur klinis terintegrasi dari dokter ke kasir.
- Rekam medis dokter (SOAP)
- E-Prescription + integrasi stok apotek
- Modul kasir & tagihan otomatis
- Update status kamar oleh Perawat VK

### Phase 3 — Optimization (Bulan 7–9)
**Fokus:** Peningkatan pengalaman pengguna dan fitur lanjutan.
- Notifikasi real-time (status antrean, kamar tersedia)
- Laporan & analitik manajemen
- Optimasi performa & keamanan
- Persiapan integrasi BPJS (v2.0)

---

## 12. Glosarium

| Istilah | Definisi |
|---|---|
| VK (Verlos Kamer) | Ruang bersalin di rumah sakit |
| RBAC | Role-Based Access Control — kontrol akses berdasarkan peran pengguna |
| E-Prescription | Resep elektronik yang diterbitkan dokter secara digital |
| Live Ward Tracker | Fitur pemantauan ketersediaan kamar secara real-time |
| SOAP | Metode pencatatan rekam medis: Subjective, Objective, Assessment, Plan |
| RTO | Recovery Time Objective — target waktu pemulihan sistem setelah gangguan |
| DAU | Daily Active Users — jumlah pengguna aktif harian |

---

*Dokumen ini merupakan living document yang akan diperbarui seiring perkembangan produk. Setiap perubahan signifikan harus mendapat persetujuan Product Owner dan dicatat dalam riwayat versi.*

---
**Dibuat oleh:** Tim Produk TrixSehat  
**Terakhir diperbarui:** 09 Juni 2026
