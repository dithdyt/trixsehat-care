import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";

// KNOWN LIMITATION (MVP/PoC): better-sqlite3 membuka satu file SQLite secara
// synchronous dan single-writer dalam satu proses Node. Ini cukup untuk demo/PoC
// single-instance, tapi TIDAK aman untuk deployment multi-instance/serverless
// (tiap instance punya koneksi file terpisah ke disk yang sama -> race condition
// pada write bersamaan, termasuk generator nomor antrean di
// app/api/booking/route.ts yang masih count-then-insert tanpa unique index pada
// (tglKunjungan, nomorAntrean)). Sebelum production scale-out, migrasikan ke
// database server (mis. PostgreSQL) yang mendukung concurrent writer dan
// tambahkan unique constraint pada kombinasi tersebut.
const sqlite = new Database(process.env.DATABASE_URL ?? "trixsehat.sqlite");

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
