import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { user } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

const BPJS_NUMBER_PATTERN = /^\d{13}$/;

// Endpoint ini hanya menangani hasil simulasi "BPJS ditemukan & aktif" — hasil
// "tidak ditemukan" murni ditangani di client (tidak ada perubahan data),
// karena ini cuma simulasi UI, bukan integrasi BPJS VClaim sungguhan.
export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Silakan login untuk verifikasi BPJS." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    bpjsNumber?: string;
  };
  const bpjsNumber = body.bpjsNumber?.trim();

  if (!bpjsNumber || !BPJS_NUMBER_PATTERN.test(bpjsNumber)) {
    return NextResponse.json(
      { error: "ValidationError", message: "Nomor kartu BPJS harus tepat 13 digit angka." },
      { status: 400 },
    );
  }

  const bpjsVerifiedAt = new Date();

  db.update(user)
    .set({ bpjsNumber, bpjsActive: true, bpjsVerifiedAt })
    .where(eq(user.id, session.user.id))
    .run();

  return NextResponse.json({
    data: { bpjsNumber, bpjsActive: true, bpjsVerifiedAt },
  });
}
