import { hashPassword } from "better-auth/crypto";
import { and, count, eq } from "drizzle-orm";

import { db, sqlite } from "@/db";
import {
  account,
  kamarVkRawat,
  rekamMedisElektronik,
  user,
} from "@/db/schema";

let initialized = false;
let staffSeedPromise: Promise<void> | null = null;

export function ensureDatabase() {
  if (initialized) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      role TEXT NOT NULL DEFAULT 'pasien',
      username TEXT,
      displayUsername TEXT,
      phoneNumber TEXT,
      nik TEXT,
      address TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
    CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON user(username);

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY NOT NULL,
      expiresAt INTEGER NOT NULL,
      token TEXT NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON session(token);

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      expiresAt INTEGER,
      accessTokenExpiresAt INTEGER,
      refreshTokenExpiresAt INTEGER,
      scope TEXT,
      password TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY NOT NULL,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS kamar_vk_rawat (
      id_kamar TEXT PRIMARY KEY NOT NULL,
      jenis_kamar TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Tersedia',
      id_pasien TEXT REFERENCES user(id) ON DELETE SET NULL,
      tipe_masuk TEXT
    );

    CREATE TABLE IF NOT EXISTS pendaftaran (
      id TEXT PRIMARY KEY NOT NULL,
      nomor_antrean TEXT NOT NULL,
      nik TEXT NOT NULL,
      nama_pasien TEXT NOT NULL,
      tgl_kunjungan TEXT NOT NULL,
      poliklinik TEXT NOT NULL DEFAULT 'Poliklinik Kebidanan & Kandungan (Obgyn)',
      dokter TEXT NOT NULL DEFAULT 'dr. Coralin Santoso, Sp.OG',
      keluhan TEXT,
      alasan_batal TEXT,
      status TEXT NOT NULL DEFAULT 'MENUNGGU',
      userId TEXT REFERENCES user(id) ON DELETE CASCADE,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rekam_medis_elektronik (
      id_rme TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      keluhan_utama TEXT NOT NULL,
      diagnosa_icd10 TEXT NOT NULL,
      tindakan_medis TEXT NOT NULL,
      resep_obat TEXT,
      status_resep TEXT NOT NULL DEFAULT 'Diproses apotek',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pembayaran_billing (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      id_rme TEXT REFERENCES rekam_medis_elektronik(id_rme) ON DELETE SET NULL,
      id_pendaftaran TEXT REFERENCES pendaftaran(id) ON DELETE SET NULL,
      deskripsi TEXT NOT NULL DEFAULT 'Tagihan pemeriksaan',
      biaya_jasa_dokter INTEGER NOT NULL DEFAULT 0,
      biaya_obat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'TERTUNDA',
      tgl_lunas INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS log_aktivitas_vk (
      id TEXT PRIMARY KEY NOT NULL,
      id_kamar TEXT NOT NULL REFERENCES kamar_vk_rawat(id_kamar) ON DELETE CASCADE,
      status TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notifikasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      userId TEXT REFERENCES user(id) ON DELETE CASCADE,
      guest_id_daftar TEXT REFERENCES pendaftaran(id) ON DELETE CASCADE,
      pesan TEXT NOT NULL,
      tgl_notif INTEGER NOT NULL DEFAULT (unixepoch()),
      isRead INTEGER NOT NULL DEFAULT 0
    );
  `);

  addColumnIfMissing("user", "username", "TEXT");
  addColumnIfMissing("user", "displayUsername", "TEXT");
  addColumnIfMissing("user", "phoneNumber", "TEXT");
  addColumnIfMissing("user", "nik", "TEXT");
  addColumnIfMissing("user", "address", "TEXT");
  addColumnIfMissing("account", "expiresAt", "INTEGER");
  addColumnIfMissing("kamar_vk_rawat", "tipe_masuk", "TEXT");
  migratePendaftaranSchema();
  addColumnIfMissing(
    "pendaftaran",
    "poliklinik",
    "TEXT NOT NULL DEFAULT 'Poliklinik Kebidanan & Kandungan (Obgyn)'",
  );
  addColumnIfMissing(
    "pendaftaran",
    "dokter",
    "TEXT NOT NULL DEFAULT 'dr. Coralin Santoso, Sp.OG'",
  );
  addColumnIfMissing("pendaftaran", "keluhan", "TEXT");
  addColumnIfMissing("pendaftaran", "alasan_batal", "TEXT");
  addColumnIfMissing("pembayaran_billing", "tgl_lunas", "INTEGER");
  sqlite.exec(`
    UPDATE kamar_vk_rawat
    SET status = 'Tidak Aktif'
    WHERE status = 'Terbatas';
  `);
  seedOperationalData();
  staffSeedPromise ??= seedStaffAccounts();
  initialized = true;
}

export async function ensureStaffAccountsSeeded() {
  ensureDatabase();
  if (!staffSeedPromise) staffSeedPromise = seedStaffAccounts();
  await staffSeedPromise;
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migratePendaftaranSchema() {
  const columns = sqlite
    .prepare("PRAGMA table_info(pendaftaran)")
    .all() as Array<{ name: string; notnull: number }>;

  const hasNewShape =
    columns.some((item) => item.name === "id") &&
    columns.some((item) => item.name === "nomor_antrean") &&
    columns.some((item) => item.name === "status");

  if (hasNewShape) return;

  const hasLegacyShape = columns.some((item) => item.name === "id_daftar");

  sqlite.exec(`
    PRAGMA foreign_keys=off;
    CREATE TABLE pendaftaran_new (
      id TEXT PRIMARY KEY NOT NULL,
      nomor_antrean TEXT NOT NULL,
      nik TEXT NOT NULL,
      nama_pasien TEXT NOT NULL,
      tgl_kunjungan TEXT NOT NULL,
      poliklinik TEXT NOT NULL DEFAULT 'Poliklinik Kebidanan & Kandungan (Obgyn)',
      dokter TEXT NOT NULL DEFAULT 'dr. Coralin Santoso, Sp.OG',
      keluhan TEXT,
      alasan_batal TEXT,
      status TEXT NOT NULL DEFAULT 'MENUNGGU',
      userId TEXT REFERENCES user(id) ON DELETE CASCADE,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  if (hasLegacyShape) {
    sqlite.exec(`
    INSERT INTO pendaftaran_new (
      id, nomor_antrean, nik, nama_pasien, tgl_kunjungan,
      poliklinik, dokter, keluhan, alasan_batal, status, userId, createdAt
    )
    SELECT
      id_daftar,
      COALESCE(no_antrian, 'A-0000'),
      nik,
      nama_pasien,
      tgl_kunjungan,
      'Poliklinik Kebidanan & Kandungan (Obgyn)',
      'dr. Coralin Santoso, Sp.OG',
      NULL,
      NULL,
      CASE
        WHEN UPPER(status_pasien) IN ('MENUNGGU', 'DIPANGGIL', 'SELESAI', 'BATAL')
          THEN UPPER(status_pasien)
        WHEN status_pasien = 'Menunggu' THEN 'MENUNGGU'
        ELSE 'MENUNGGU'
      END,
      userId,
      createdAt
    FROM pendaftaran;
    `);
  }

  sqlite.exec(`
    DROP TABLE pendaftaran;
    ALTER TABLE pendaftaran_new RENAME TO pendaftaran;
    PRAGMA foreign_keys=on;
  `);
}

function seedOperationalData() {
  const rsuWardRooms = [
    { idKamar: "Kamar 01", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
    { idKamar: "Kamar 02", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
    { idKamar: "Kamar 03", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
    { idKamar: "Kamar 04", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
    { idKamar: "Kamar 05", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
    { idKamar: "Kamar 06", jenisKamar: "Kamar Rawat Umum", status: "Tersedia" },
  ] as const;

  const [{ value: userCount }] = db.select({ value: count() }).from(user).all();
  if (userCount === 0) {
    db.insert(user)
      .values({
        id: "demo-pasien-nadia",
        name: "Nadia Putri",
        email: "nadia@trixsehat.test",
        emailVerified: true,
        role: "pasien",
      })
      .run();
  }

  const insertWardRoom = sqlite.prepare(`
    INSERT OR REPLACE INTO kamar_vk_rawat (
      id_kamar, jenis_kamar, status, id_pasien, tipe_masuk
    ) VALUES (
      @idKamar, @jenisKamar, @status, NULL, NULL
    );
  `);
  sqlite.exec("DELETE FROM log_aktivitas_vk;");
  sqlite.exec("DELETE FROM kamar_vk_rawat;");
  rsuWardRooms.forEach((room) => insertWardRoom.run(room));

  const [{ value: rmeCount }] = db
    .select({ value: count() })
    .from(rekamMedisElektronik)
    .all();
  if (rmeCount === 0) {
    db.insert(rekamMedisElektronik)
      .values({
        idRme: "rme-demo-nadia-001",
        userId: "demo-pasien-nadia",
        keluhanUtama: "Kontrol rutin kehamilan trimester 3",
        diagnosaIcd10: "Z34.8 - Supervision of other normal pregnancy",
        tindakanMedis: "Pemeriksaan tekanan darah, konsultasi, dan vitamin prenatal",
        resepObat: [
          { nama: "Asam folat 400 mcg", dosis: "1 tablet, 1x sehari", harga: 42000 },
          { nama: "Calcium lactate 500 mg", dosis: "1 tablet, 2x sehari", harga: 68000 },
          { nama: "Vitamin D3", dosis: "1 kapsul, 1x sehari", harga: 55000 },
        ],
        statusResep: "Diproses apotek",
      })
      .run();
  }
}

async function seedStaffAccounts() {
  const staffAccounts = [
    {
      id: "staff-dr-coralin",
      accountTableId: "account-staff-dr-coralin",
      name: "dr. Coralin Santoso, Sp.OG",
      email: "dr.coralin@trixsehat.com",
      role: "medis",
      nik: "3174000000000024",
      phoneNumber: "081211112222",
      address: "Poli Obgyn, RSU TrixSehat",
    },
    {
      id: "staff-dr-lestari",
      accountTableId: "account-staff-dr-lestari",
      name: "dr. Lestari Ayuningtyas, Sp.OG",
      email: "dr.lestari@trixsehat.com",
      role: "medis",
      nik: "3174000000000026",
      phoneNumber: "081211112223",
      address: "Poli Obgyn, RSU TrixSehat",
    },
    {
      id: "staff-dr-andi",
      accountTableId: "account-staff-dr-andi",
      name: "dr. Andi Anemon Wijaya, Sp.A",
      email: "dr.andi@trixsehat.com",
      role: "medis",
      nik: "3174000000000027",
      phoneNumber: "081211112224",
      address: "Poli Pediatrik, RSU TrixSehat",
    },
    {
      id: "staff-dr-ratna",
      accountTableId: "account-staff-dr-ratna",
      name: "dr. Ratna Puspita, Sp.A",
      email: "dr.ratna@trixsehat.com",
      role: "medis",
      nik: "3174000000000028",
      phoneNumber: "081211112225",
      address: "Poli Pediatrik, RSU TrixSehat",
    },
    {
      id: "staff-dr-bima",
      accountTableId: "account-staff-dr-bima",
      name: "dr. Bima Satriya, Sp.PD",
      email: "dr.bima@trixsehat.com",
      role: "medis",
      nik: "3174000000000029",
      phoneNumber: "081211112226",
      address: "Poli Penyakit Dalam, RSU TrixSehat",
    },
    {
      id: "staff-dr-farhan",
      accountTableId: "account-staff-dr-farhan",
      name: "dr. Farhan Mahendra, Sp.B",
      email: "dr.farhan@trixsehat.com",
      role: "medis",
      nik: "3174000000000030",
      phoneNumber: "081211112227",
      address: "Poli Bedah Umum, RSU TrixSehat",
    },
    {
      id: "staff-drg-dinda",
      accountTableId: "account-staff-drg-dinda",
      name: "drg. Dinda Maharani",
      email: "drg.dinda@trixsehat.com",
      role: "medis",
      nik: "3174000000000031",
      phoneNumber: "081211112228",
      address: "Poli Gigi dan Mulut, RSU TrixSehat",
    },
    {
      id: "staff-siti-vk",
      accountTableId: "account-staff-siti-vk",
      name: "Siti Kong",
      email: "siti.vk@trixsehat.com",
      role: "medis",
      nik: "3174000000000025",
      phoneNumber: "085622223333",
      address: "Ruang VK, RSU TrixSehat",
    },
    {
      id: "staff-admin-trixsehat",
      accountTableId: "account-staff-admin-trixsehat",
      name: "Admin Staff TrixSehat",
      email: "admin@trixsehat.com",
      role: "admin",
      nik: "3174000000000026",
      phoneNumber: "081299990000",
      address: "Loket Administrasi, RSU TrixSehat",
    },
    {
      id: "staff-budi-admin",
      accountTableId: "account-staff-budi-admin",
      name: "Budi Santoso, S.E.",
      email: "budi.adm@trixsehat.com",
      role: "admin",
      nik: "3174000000000032",
      phoneNumber: "081299990001",
      address: "Loket Administrasi, RSU TrixSehat",
    },
    {
      id: "staff-azka-dirut",
      accountTableId: "account-staff-azka-dirut",
      name: "Azka Sapling",
      email: "azka.dirut@trixsehat.com",
      role: "super_admin",
      nik: "3174000000000033",
      phoneNumber: "081299990002",
      address: "Direksi RSU TrixSehat",
    },
  ];

  for (const staff of staffAccounts) {
    const existingUser = db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, staff.email))
      .limit(1)
      .get();
    const userId = existingUser?.id ?? staff.id;

    if (!existingUser) {
      db.insert(user)
        .values({
          id: userId,
          name: staff.name,
          email: staff.email,
          emailVerified: true,
          role: staff.role,
          nik: staff.nik,
          phoneNumber: staff.phoneNumber,
          address: staff.address,
        })
        .run();
    } else {
      db.update(user)
        .set({
          name: staff.name,
          role: staff.role,
          nik: staff.nik,
          phoneNumber: staff.phoneNumber,
          address: staff.address,
          updatedAt: new Date(),
        })
        .where(eq(user.email, staff.email))
        .run();
    }

    const existingCredentialAccount = db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .limit(1)
      .get();

    if (!existingCredentialAccount) {
      const password = await hashPassword("password123");
      db.insert(account)
        .values({
          id: staff.accountTableId,
          accountId: userId,
          providerId: "credential",
          userId,
          password,
        })
        .onConflictDoNothing()
        .run();
    }
  }
}
