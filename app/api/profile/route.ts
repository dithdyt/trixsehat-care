import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { user } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Silakan login untuk mengubah profil." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    phoneNumber?: string;
    nik?: string;
    address?: string;
  };

  const name = body.name?.trim() ?? "";
  const phoneNumber = body.phoneNumber?.trim() ?? "";
  const nik = body.nik?.trim() ?? "";
  const address = body.address?.trim() ?? "";

  if (!name || !phoneNumber || !nik || !address) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "Nama, nomor handphone, NIK, dan alamat rumah wajib diisi.",
      },
      { status: 400 },
    );
  }

  if (!/^\d{16}$/.test(nik) || !/^\d+$/.test(phoneNumber)) {
    return NextResponse.json(
      {
        error: "ValidationError",
        message: "NIK harus tepat 16 digit dan nomor handphone hanya boleh angka.",
      },
      { status: 400 },
    );
  }

  db.update(user)
    .set({
      name,
      phoneNumber,
      nik,
      address,
      updatedAt: new Date(),
    })
    .where(eq(user.id, session.user.id))
    .run();

  const updatedUser = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      nik: user.nik,
      address: user.address,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
    .get();

  return NextResponse.json({ data: updatedUser });
}
