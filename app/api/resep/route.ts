import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import {
  notifikasi,
  pembayaranBilling,
  pendaftaran,
  rekamMedisElektronik,
  user,
} from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const url = new URL(request.url);
  const guestIdDaftar = url.searchParams.get("id_daftar")?.trim();
  let targetUserId = session?.user?.id;

  if (role === "admin" || role === "super_admin") {
    const pharmacyQueueStatuses = ["Diproses apotek"] as const;
    const records = db
      .select({
        idRme: rekamMedisElektronik.idRme,
        userId: rekamMedisElektronik.userId,
        namaPasien: user.name,
        nikPasien: user.nik,
        keluhanUtama: rekamMedisElektronik.keluhanUtama,
        diagnosaIcd10: rekamMedisElektronik.diagnosaIcd10,
        tindakanMedis: rekamMedisElektronik.tindakanMedis,
        resepObat: rekamMedisElektronik.resepObat,
        statusResep: rekamMedisElektronik.statusResep,
        createdAt: rekamMedisElektronik.createdAt,
      })
      .from(rekamMedisElektronik)
      .leftJoin(user, eq(rekamMedisElektronik.userId, user.id))
      .where(inArray(rekamMedisElektronik.statusResep, [...pharmacyQueueStatuses]))
      .orderBy(desc(rekamMedisElektronik.createdAt))
      .all();

    return NextResponse.json({ data: records });
  }

  if (!targetUserId && guestIdDaftar) {
    const guestBooking = db
      .select()
      .from(pendaftaran)
      .where(eq(pendaftaran.id, guestIdDaftar))
      .limit(1)
      .get();

    if (!guestBooking?.userId) return NextResponse.json({ data: [] });
    targetUserId = guestBooking.userId.startsWith("guest-")
      ? guestBooking.userId
      : undefined;
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Silakan login untuk melihat resep." },
      { status: 401 },
    );
  }

  const records = db
    .select({
      idRme: rekamMedisElektronik.idRme,
      userId: rekamMedisElektronik.userId,
      keluhanUtama: rekamMedisElektronik.keluhanUtama,
      diagnosaIcd10: rekamMedisElektronik.diagnosaIcd10,
      tindakanMedis: rekamMedisElektronik.tindakanMedis,
      resepObat: rekamMedisElektronik.resepObat,
      statusResep: rekamMedisElektronik.statusResep,
      createdAt: rekamMedisElektronik.createdAt,
    })
    .from(rekamMedisElektronik)
    .innerJoin(pembayaranBilling, eq(pembayaranBilling.idRme, rekamMedisElektronik.idRme))
    .where(
      and(
        eq(rekamMedisElektronik.userId, targetUserId),
        inArray(rekamMedisElektronik.statusResep, [
          "Diproses apotek",
          "Siap diambil",
        ]),
        eq(pembayaranBilling.status, "TERTUNDA"),
      ),
    )
    .orderBy(desc(rekamMedisElektronik.createdAt))
    .all();

  return NextResponse.json({ data: records });
}

export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Akses hanya untuk admin." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    idRme?: string;
    statusResep?: string;
  };

  if (!body.idRme) {
    return NextResponse.json(
      { error: "ValidationError", message: "ID resep wajib diisi." },
      { status: 400 },
    );
  }

  const result = db.transaction((tx) => {
    const rme = tx
      .select()
      .from(rekamMedisElektronik)
      .where(eq(rekamMedisElektronik.idRme, body.idRme!))
      .limit(1)
      .get();

    if (!rme) return null;

    tx.update(rekamMedisElektronik)
      .set({ statusResep: body.statusResep ?? "Siap diambil" })
      .where(eq(rekamMedisElektronik.idRme, body.idRme!))
      .run();

    const billing = tx
      .select({ idPendaftaran: pembayaranBilling.idPendaftaran })
      .from(pembayaranBilling)
      .where(eq(pembayaranBilling.idRme, rme.idRme))
      .limit(1)
      .get();

    tx.insert(notifikasi)
      .values({
        userId: rme.userId.startsWith("guest-") ? null : rme.userId,
        guestIdDaftar: rme.userId.startsWith("guest-")
          ? billing?.idPendaftaran ?? null
          : null,
        pesan: "Resep obat Anda sudah siap diambil di Apotek.",
      })
      .run();

    return { ...rme, statusResep: body.statusResep ?? "Siap diambil" };
  });

  if (!result) {
    return NextResponse.json(
      { error: "NotFound", message: "Data resep tidak ditemukan." },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: result });
}
