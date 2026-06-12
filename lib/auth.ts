import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import * as schema from "@/db/schema";

ensureDatabase();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "trixsehat-local-development-secret-change-me",
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
    },
  },
  plugins: [username(), nextCookies()],
});

export type AuthSession = Awaited<
  ReturnType<typeof auth.api.getSession<false, false>>
>;
