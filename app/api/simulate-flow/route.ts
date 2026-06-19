import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import {
  kamarVkRawat,
  notifikasi,
  pembayaranBilling,
  pendaftaran,
  rekamMedisElektronik,
  user,
} from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

const ACTIVE_STATUSES = ["MENUNGGU", "DIPANGGIL"] as const;
const doctorNameByEmail: Record<string, string> = {
  "dr.coralin@trixsehat.com": "dr. Coralin Santoso, Sp.OG",
  "dr.lestari@trixsehat.com": "dr. Lestari Ayuningtyas, Sp.OG",
  "dr.andi@trixsehat.com": "dr. Andi Anemon Wijaya, Sp.A",
  "dr.ratna@trixsehat.com": "dr. Ratna Puspita, Sp.A",
  "dr.bima@trixsehat.com": "dr. Bima Satriya, Sp.PD",
  "dr.farhan@trixsehat.com": "dr. Farhan Mahendra, Sp.B",
  "drg.dinda@trixsehat.com": "drg. Dinda Maharani",
};
const BIAYA_JASA_DOKTER = 120000;
const BIAYA_ADMINISTRASI = 50000;
const SIMULATED_RESEP = [
  { nama: "Asam folat 400 mcg", dosis: "1 tablet, 1x sehari", harga: 42000, qty: 1 },
  { nama: "Calcium lactate 500 mg", dosis: "1 tablet, 2x sehari", harga: 68000, qty: 1 },
  { nama: "Vitamin D3", dosis: "1 kapsul, 1x sehari", harga: 49000, qty: 1 },
];

type ResepInput = {
  nama: string;
  dosis: string;
  harga: number;
  qty?: number;
};

function isValidResepInput(items: ResepInput[] | undefined) {
  if (!items) return true;

  return items.every(
    (item) =>
      Number.isFinite(item.harga) &&
      item.harga >= 0 &&
      (item.qty === undefined || (Number.isFinite(item.qty) && item.qty >= 0)),
  );
}

function calculateBillingTotals(resepObat: ResepInput[]) {
  const biayaObat = resepObat.reduce((sum, item) => {
    const qty = Math.max(Number(item.qty ?? 1), 1);
    return sum + Number(item.harga ?? 0) * qty;
  }, 0);

  return {
    biayaJasaDokter: BIAYA_JASA_DOKTER,
    biayaObat,
    total: BIAYA_JASA_DOKTER + BIAYA_ADMINISTRASI + biayaObat,
  };
}

export async function POST(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Silakan login untuk menjalankan simulasi." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    idPendaftaran?: string;
    soap?: string;
    diagnosaIcd10?: string;
    tindakanMedis?: string;
    resepObat?: ResepInput[];
    rujukVk?: boolean;
  };
  if (!isValidResepInput(body.resepObat)) {
    return NextResponse.json(
      { error: "ValidationError", message: "Harga atau jumlah obat tidak valid." },
      { status: 400 },
    );
  }

  const role = (session.user as { role?: string }).role;

  if (role === "medis" && body.idPendaftaran) {
    const selectedBooking = db
      .select()
      .from(pendaftaran)
      .where(eq(pendaftaran.id, body.idPendaftaran))
      .limit(1)
      .get();

    if (!selectedBooking) {
      return NextResponse.json(
        { error: "NotFound", message: "Data antrean tidak ditemukan." },
        { status: 404 },
      );
    }

    // Cabang ini hanya dimasuki oleh role "medis" (dokter); super_admin/perawat VK
    // tidak menggunakan endpoint EMR ini di UI. Dokter hanya boleh menyelesaikan
    // pemeriksaan untuk pasien yang memang terdaftar pada dirinya.
    const email = session.user.email ?? "";
    const doctorName = doctorNameByEmail[email];

    if (!doctorName || selectedBooking.dokter !== doctorName) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Anda tidak berwenang memproses antrean pasien dokter lain.",
        },
        { status: 403 },
      );
    }

    if (body.rujukVk) {
      const availableVk = db
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

      if (!availableVk) {
        return NextResponse.json(
          {
            error: "WardFull",
            message:
              "Gagal Merujuk: Kamar rawat penuh. Silakan hubungi Perawat untuk koordinasi rujukan eksternal.",
          },
          { status: 409 },
        );
      }
    }

    const result = db.transaction((tx) => {
      let patientUserId = selectedBooking.userId;
      if (!patientUserId) {
        patientUserId = `guest-${selectedBooking.id}`;
        const existingGuestUser = tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, patientUserId))
          .limit(1)
          .get();

        if (!existingGuestUser) {
          tx.insert(user)
            .values({
              id: patientUserId,
              name: selectedBooking.namaPasien,
              email: `${patientUserId}@guest.trixsehat.local`,
              emailVerified: true,
              role: "pasien",
              nik: selectedBooking.nik,
              address: "Pasien Guest TrixSehat",
            })
            .run();
        }

        tx.update(pendaftaran)
          .set({ userId: patientUserId })
          .where(eq(pendaftaran.id, selectedBooking.id))
          .run();
      }

      const resepObat =
        body.resepObat?.filter((item) => item.nama.trim()) ?? SIMULATED_RESEP;
      const billingTotals = calculateBillingTotals(resepObat);
      const idRme = crypto.randomUUID();

      const rme = {
        idRme,
        userId: patientUserId,
        keluhanUtama:
          body.soap?.trim() ||
          selectedBooking.keluhan ||
          "Pemeriksaan klinis oleh dokter spesialis",
        diagnosaIcd10:
          body.diagnosaIcd10?.trim() ||
          "Z34.8 - Supervision of other normal pregnancy",
        tindakanMedis:
          body.tindakanMedis?.trim() ||
          "Pemeriksaan dokter spesialis dan penerbitan resep digital",
        resepObat,
        statusResep: "Diproses apotek",
      };

      const billing = {
        id: crypto.randomUUID(),
        userId: patientUserId,
        idRme,
        idPendaftaran: selectedBooking.id,
        deskripsi: "Tagihan pemeriksaan dokter dan resep digital",
        ...billingTotals,
        status: "TERTUNDA" as const,
      };

      tx.insert(rekamMedisElektronik).values(rme).run();
      tx.insert(pembayaranBilling).values(billing).run();
      tx.update(pendaftaran)
        .set({ status: "SELESAI" })
        .where(eq(pendaftaran.id, selectedBooking.id))
        .run();
      tx.insert(notifikasi)
        .values({
          userId: patientUserId,
          guestIdDaftar: selectedBooking.userId ? null : selectedBooking.id,
          pesan:
            "Resep obat Anda siap diambil. Tagihan pemeriksaan sudah tersedia di kasir.",
        })
        .run();

      let assignedRoom: string | null = null;
      if (body.rujukVk) {
        const availableVk = tx
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

        if (availableVk) {
          tx.update(kamarVkRawat)
            .set({
              status: "Terisi",
              idPasien: patientUserId,
              tipeMasuk: "Rujukan Dokter",
            })
            .where(eq(kamarVkRawat.idKamar, availableVk.idKamar))
            .run();
          assignedRoom = availableVk.idKamar;
        }
      }

      return {
        rme,
        billing,
        assignedRoom,
        booking: { ...selectedBooking, status: "SELESAI" },
      };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  }

  const activeBooking = db
    .select()
    .from(pendaftaran)
    .where(
      and(
        eq(pendaftaran.userId, session.user.id),
        inArray(pendaftaran.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1)
    .get();

  if (!activeBooking) {
    return NextResponse.json(
      {
        error: "ActiveBookingRequired",
        message: "Buat antrean aktif terlebih dahulu sebelum simulasi pemeriksaan.",
      },
      { status: 404 },
    );
  }

  const result = db.transaction((tx) => {
    const billingTotals = calculateBillingTotals(SIMULATED_RESEP);
    const idRme = crypto.randomUUID();

    const rme = {
      idRme,
      userId: session.user.id,
      keluhanUtama:
        activeBooking.keluhan || "Kontrol rutin dan konsultasi kesehatan pasien",
      diagnosaIcd10: "Z34.8 - Supervision of other normal pregnancy",
      tindakanMedis:
        "Pemeriksaan dokter spesialis, konsultasi, dan penerbitan resep digital",
      resepObat: SIMULATED_RESEP,
      statusResep: "Diproses apotek",
    };

    const billing = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      idRme,
      idPendaftaran: activeBooking.id,
      deskripsi: "Tagihan pemeriksaan dokter dan resep digital",
      ...billingTotals,
      status: "TERTUNDA" as const,
    };

    tx.insert(rekamMedisElektronik).values(rme).run();
    tx.insert(pembayaranBilling).values(billing).run();
    tx.update(pendaftaran)
      .set({ status: "SELESAI" })
      .where(eq(pendaftaran.id, activeBooking.id))
      .run();
    tx.insert(notifikasi)
      .values({
        userId: session.user.id,
        pesan:
          "Resep obat Anda siap diambil. Tagihan pemeriksaan sudah tersedia di kasir.",
      })
      .run();

    return { rme, billing, booking: { ...activeBooking, status: "SELESAI" } };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
