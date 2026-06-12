import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { kamarVkRawat, logAktivitasVk, user } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  ensureDatabase();

  const rooms = db
    .select({
      idKamar: kamarVkRawat.idKamar,
      jenisKamar: kamarVkRawat.jenisKamar,
      status: kamarVkRawat.status,
      idPasien: kamarVkRawat.idPasien,
      tipeMasuk: kamarVkRawat.tipeMasuk,
      namaPasien: user.name,
      nikPasien: user.nik,
    })
    .from(kamarVkRawat)
    .leftJoin(user, eq(kamarVkRawat.idPasien, user.id))
    .orderBy(asc(kamarVkRawat.jenisKamar), asc(kamarVkRawat.idKamar))
    .all();

  const summary = rooms.reduce<Record<string, { total: number; available: number }>>(
    (acc, room) => {
      acc[room.jenisKamar] ??= { total: 0, available: 0 };
      acc[room.jenisKamar].total += 1;
      if (room.status === "Tersedia") acc[room.jenisKamar].available += 1;
      return acc;
    },
    {},
  );

  const logs = db
    .select()
    .from(logAktivitasVk)
    .orderBy(desc(logAktivitasVk.createdAt))
    .limit(12)
    .all();

  return NextResponse.json({ data: rooms, summary, logs });
}

export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "medis" && role !== "super_admin")) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Akses hanya untuk staf medis." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    idKamar?: string;
    status?: "Tersedia" | "Terisi" | "Sedang Dibersihkan" | "Tidak Aktif";
  };

  const validStatuses = [
    "Tersedia",
    "Terisi",
    "Sedang Dibersihkan",
    "Tidak Aktif",
  ] as const;

  if (!body.idKamar || !body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "ValidationError", message: "ID kamar dan status valid wajib diisi." },
      { status: 400 },
    );
  }

  const actorName =
    session.user.email === "siti.vk@trixsehat.com"
      ? "Siti Kong"
      : (session.user.name ?? "Staf Medis TrixSehat");
  const updatedRoom = db.transaction((tx) => {
    const nextRoomState =
      body.status === "Tersedia"
        ? { status: body.status, idPasien: null, tipeMasuk: null }
        : { status: body.status };

    tx.update(kamarVkRawat)
      .set(nextRoomState)
      .where(eq(kamarVkRawat.idKamar, body.idKamar!))
      .run();

    tx.insert(logAktivitasVk)
      .values({
        id: crypto.randomUUID(),
        idKamar: body.idKamar!,
        status: body.status!,
        actorName,
      })
      .run();

    return tx
      .select()
      .from(kamarVkRawat)
      .where(eq(kamarVkRawat.idKamar, body.idKamar!))
      .limit(1)
      .get();
  });

  return NextResponse.json({ data: updatedRoom });
}
