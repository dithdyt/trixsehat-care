import { randomBytes } from "crypto";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

const NIK_PATTERN = /^\d{16}$/;

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import * as schema from "@/db/schema";

ensureDatabase();

function resolveAuthSecret() {
  const configuredSecret = process.env.BETTER_AUTH_SECRET;
  if (configuredSecret) return configuredSecret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET wajib diset di environment production. " +
        "Jangan jalankan production tanpa secret yang eksplisit dikonfigurasi.",
    );
  }

  console.warn(
    "[auth] BETTER_AUTH_SECRET tidak diset — menggunakan secret acak sementara " +
      "untuk development (akan berubah setiap restart server, semua session lama " +
      "menjadi invalid). Set BETTER_AUTH_SECRET di .env untuk session yang persisten.",
  );
  return randomBytes(32).toString("hex");
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: resolveAuthSecret(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
    camelCase: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "pasien",
        input: false,
      },
      phoneNumber: {
        type: "string",
        required: true,
        input: true,
      },
      nik: {
        type: "string",
        required: true,
        input: true,
      },
      address: {
        type: "string",
        required: false,
        input: true,
      },
      bpjsNumber: {
        type: "string",
        required: false,
        input: false,
      },
      bpjsActive: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      bpjsVerifiedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const nik = (userData as { nik?: string }).nik;
          if (nik !== undefined && !NIK_PATTERN.test(nik)) {
            throw new APIError("BAD_REQUEST", {
              message: "NIK harus tepat 16 digit angka.",
            });
          }
        },
      },
    },
  },
  plugins: [username(), nextCookies()],
});

export type AuthSession = Awaited<
  ReturnType<typeof auth.api.getSession<false, false>>
>;
