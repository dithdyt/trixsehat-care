import type { Config } from "drizzle-kit";

// KNOWN TECHNICAL DEBT: project ini belum pernah menjalankan `drizzle-kit
// generate`/`migrate` — folder `out` di bawah tidak berisi migration apa pun.
// Skema database aktual dibuat & dievolusikan manual lewat raw SQL di
// db/init.ts (CREATE TABLE IF NOT EXISTS + addColumnIfMissing), terpisah dari
// db/schema.ts. Kedua sumber ini berisiko drift seiring waktu. Untuk MVP/PoC
// ini sengaja dibiarkan apa adanya (lihat audit findings) — sebelum production
// nyata, migrasikan ke `drizzle-kit generate` sebagai source of truth tunggal
// dan hapus pendekatan raw-SQL manual di db/init.ts.
export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "trixsehat.sqlite",
  },
} satisfies Config;
