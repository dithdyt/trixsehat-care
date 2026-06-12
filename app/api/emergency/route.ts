import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { kamarVkRawat, notifikasi, pendaftaran } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const body = (await request.json().catch(() => ({}))) as {
    namaPasien?: string;
    nik?: string;
  };
  const today = new Date().toISOString().slice(0, 10);

  const availableVkBeforeTransaction = db
    .select()
    .from(kamarVkRawat)
    .where(
      and(
        eq(kamarVkRawat.jenisKamar, "Kamar Rawat Umum"),
        eq(kamarVkRawat.status, "Tersedia"),
      ),
    )
    .limit(1)
    .get();

  if (!availableVkBeforeTransaction) {
    return NextResponse.json(
      {
        error: "WardFull",
        message:
          "Mohon Maaf, Kamar Bersalin TrixSehat saat ini Penuh. Tim medis kami akan mengarahkan ambulans langsung ke Rumah Sakit Rujukan terdekat demi keselamatan Anda.",
      },
      { status: 409 },
    );
  }
  const reservedVk = availableVkBeforeTransaction;

  const result = db.transaction((tx) => {
    const [{ value: emergencyCount }] = tx
      .select({ value: count() })
      .from(pendaftaran)
      .where(eq(pendaftaran.keluhan, "Darurat Melahirkan"))
      .all();

    const booking = {
      id: crypto.randomUUID(),
      nomorAntrean: `EMG-${String(emergencyCount + 1).padStart(3, "0")}`,
      nik: body.nik?.trim() || "DARURAT",
      namaPasien:
        body.namaPasien?.trim() || session?.user?.name || "Pasien Darurat",
      tglKunjungan: today,
      poliklinik: "Instalasi Gawat Darurat Maternal",
      dokter: "Tim Emergency Maternal TrixSehat",
      keluhan: "Darurat Melahirkan",
      status: "DIPANGGIL" as const,
      userId: session?.user?.id ?? null,
    };

    tx.insert(pendaftaran).values(booking).run();
    tx.insert(notifikasi)
      .values({
        userId: booking.userId,
        guestIdDaftar: booking.userId ? null : booking.id,
        pesan: `Darurat kebidanan ${booking.nomorAntrean} aktif. Ambulans OTW dan kamar ${reservedVk.idKamar} dicadangkan.`,
      })
      .run();
    tx.update(kamarVkRawat)
      .set({
        status: "Terisi",
        idPasien: session?.user?.id ?? null,
        tipeMasuk: "Pasien Darurat",
      })
      .where(eq(kamarVkRawat.idKamar, reservedVk.idKamar))
      .run();

    return { booking, assignedRoom: reservedVk.idKamar };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
