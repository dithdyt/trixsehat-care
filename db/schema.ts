import { relations, sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("emailVerified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updatedAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    role: text("role").notNull().default("pasien"),
    username: text("username"),
    displayUsername: text("displayUsername"),
    phoneNumber: text("phoneNumber"),
    nik: text("nik"),
    address: text("address"),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_unique").on(table.email),
    usernameIdx: uniqueIndex("user_username_unique").on(table.username),
  }),
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updatedAt", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_unique").on(table.token),
  }),
);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const kamarVkRawat = sqliteTable("kamar_vk_rawat", {
  idKamar: text("id_kamar").primaryKey(),
  jenisKamar: text("jenis_kamar").notNull(),
  status: text("status", {
    enum: ["Tersedia", "Terisi", "Sedang Dibersihkan", "Tidak Aktif"],
  })
    .notNull()
    .default("Tersedia"),
  idPasien: text("id_pasien").references(() => user.id, {
    onDelete: "set null",
  }),
  tipeMasuk: text("tipe_masuk", {
    enum: ["Pasien Darurat", "Rujukan Dokter"],
  }),
});

export const pendaftaran = sqliteTable("pendaftaran", {
  id: text("id").primaryKey(),
  nomorAntrean: text("nomor_antrean").notNull(),
  nik: text("nik").notNull(),
  namaPasien: text("nama_pasien").notNull(),
  tglKunjungan: text("tgl_kunjungan").notNull(),
  poliklinik: text("poliklinik").notNull().default("Poliklinik Kebidanan & Kandungan (Obgyn)"),
  dokter: text("dokter").notNull().default("dr. Coralin Santoso, Sp.OG"),
  keluhan: text("keluhan"),
  alasanBatal: text("alasan_batal"),
  status: text("status", {
    enum: ["MENUNGGU", "DIPANGGIL", "SELESAI", "BATAL"],
  })
    .notNull()
    .default("MENUNGGU"),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const rekamMedisElektronik = sqliteTable("rekam_medis_elektronik", {
  idRme: text("id_rme").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  keluhanUtama: text("keluhan_utama").notNull(),
  diagnosaIcd10: text("diagnosa_icd10").notNull(),
  tindakanMedis: text("tindakan_medis").notNull(),
  resepObat: text("resep_obat", { mode: "json" }).$type<
    Array<{
      nama: string;
      dosis: string;
      harga: number;
      qty?: number;
    }>
  >(),
  statusResep: text("status_resep").notNull().default("Diproses apotek"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const pembayaranBilling = sqliteTable("pembayaran_billing", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  idRme: text("id_rme").references(() => rekamMedisElektronik.idRme, {
    onDelete: "set null",
  }),
  idPendaftaran: text("id_pendaftaran").references(() => pendaftaran.id, {
    onDelete: "set null",
  }),
  deskripsi: text("deskripsi").notNull().default("Tagihan pemeriksaan"),
  biayaJasaDokter: integer("biaya_jasa_dokter").notNull().default(0),
  biayaObat: integer("biaya_obat").notNull().default(0),
  total: integer("total").notNull().default(0),
  status: text("status", { enum: ["TERTUNDA", "LUNAS"] })
    .notNull()
    .default("TERTUNDA"),
  tglLunas: integer("tgl_lunas", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const logAktivitasVk = sqliteTable("log_aktivitas_vk", {
  id: text("id").primaryKey(),
  idKamar: text("id_kamar")
    .notNull()
    .references(() => kamarVkRawat.idKamar, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["Tersedia", "Terisi", "Sedang Dibersihkan", "Tidak Aktif"],
  })
    .notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const notifikasi = sqliteTable("notifikasi", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  guestIdDaftar: text("guest_id_daftar").references(() => pendaftaran.id, {
    onDelete: "cascade",
  }),
  pesan: text("pesan").notNull(),
  tglNotif: integer("tgl_notif", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  isRead: integer("isRead", { mode: "boolean" }).notNull().default(false),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  pendaftaran: many(pendaftaran),
  rekamMedis: many(rekamMedisElektronik),
  kamar: many(kamarVkRawat),
  billing: many(pembayaranBilling),
  logAktivitasVk: many(logAktivitasVk),
  notifikasi: many(notifikasi),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const kamarRelations = relations(kamarVkRawat, ({ one }) => ({
  pasien: one(user, {
    fields: [kamarVkRawat.idPasien],
    references: [user.id],
  }),
}));

export const pendaftaranRelations = relations(pendaftaran, ({ one }) => ({
  user: one(user, {
    fields: [pendaftaran.userId],
    references: [user.id],
  }),
}));

export const rekamMedisRelations = relations(
  rekamMedisElektronik,
  ({ one }) => ({
    user: one(user, {
      fields: [rekamMedisElektronik.userId],
      references: [user.id],
    }),
  }),
);

export const pembayaranBillingRelations = relations(
  pembayaranBilling,
  ({ one }) => ({
    user: one(user, {
      fields: [pembayaranBilling.userId],
      references: [user.id],
    }),
    rekamMedis: one(rekamMedisElektronik, {
      fields: [pembayaranBilling.idRme],
      references: [rekamMedisElektronik.idRme],
    }),
    pendaftaran: one(pendaftaran, {
      fields: [pembayaranBilling.idPendaftaran],
      references: [pendaftaran.id],
    }),
  }),
);

export const logAktivitasVkRelations = relations(logAktivitasVk, ({ one }) => ({
  kamar: one(kamarVkRawat, {
    fields: [logAktivitasVk.idKamar],
    references: [kamarVkRawat.idKamar],
  }),
}));

export const notifikasiRelations = relations(notifikasi, ({ one }) => ({
  user: one(user, {
    fields: [notifikasi.userId],
    references: [user.id],
  }),
  pendaftaran: one(pendaftaran, {
    fields: [notifikasi.guestIdDaftar],
    references: [pendaftaran.id],
  }),
}));
