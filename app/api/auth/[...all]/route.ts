import { toNextJsHandler } from "better-auth/next-js";

import { ensureStaffAccountsSeeded } from "@/db/init";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureStaffAccountsSeeded();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await ensureStaffAccountsSeeded();
  return handlers.POST(request);
}
