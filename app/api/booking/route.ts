import { and, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { notifikasi, pendaftaran } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

type BookingBody = {
  nik?: string;
  namaPasien?: string;
  tglKunjungan?: string;
  poliklinik?: string;
  dokter?: string;
  keluhan?: string;
};

const ACTIVE_STATUSES = ["MENUNGGU", "DIPANGGIL"] as const;
const BOOKING_STATUSES = ["MENUNGGU", "DIPANGGIL", "SELESAI", "BATAL"] as const;
const DEFAULT_POLIKLINIK = "Poliklinik Kebidanan & Kandungan (Obgyn)";
const DEFAULT_DOKTER = "dr. Coralin Santoso, Sp.OG";
const doctorNameByEmail: Record<string, string> = {
  "dr.coralin@trixsehat.com": "dr. Coralin Santoso, Sp.OG",
  "dr.lestari@trixsehat.com": "dr. Lestari Ayuningtyas, Sp.OG",
  "dr.andi@trixsehat.com": "dr. Andi Anemon Wijaya, Sp.A",
  "dr.ratna@trixsehat.com": "dr. Ratna Puspita, Sp.A",
  "dr.bima@trixsehat.com": "dr. Bima Satriya, Sp.PD",
  "dr.farhan@trixsehat.com": "dr. Farhan Mahendra, Sp.B",
  "drg.dinda@trixsehat.com": "drg. Dinda Maharani",
};

function getStatusNotificationMessage(
  status: "MENUNGGU" | "DIPANGGIL" | "SELESAI" | "BATAL",
  booking: typeof pendaftaran.$inferSelect,
) {
  if (status === "DIPANGGIL") {
    return `Antrean ${booking.nomorAntrean} dipanggil ke ${booking.poliklinik}.`;
  }

  if (status === "SELESAI") {
    return `Antrean ${booking.nomorAntrean} telah selesai diproses.`;
  }

  if (status === "BATAL") {
    return `Janji temu ${booking.nomorAntrean} dibatalkan oleh dokter.`;
  }

  return `Antrean ${booking.nomorAntrean} berhasil dibuat.`;
}

function insertNotification(
  target: Pick<typeof pendaftaran.$inferSelect, "id" | "userId">,
  pesan: string,
) {
  db.insert(notifikasi)
    .values({
      userId: target.userId,
      guestIdDaftar: target.userId ? null : target.id,
      pesan,
    })
    .run();
}

export async function GET(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const url = new URL(request.url);
  const guestIdDaftar = url.searchParams.get("id_daftar")?.trim();

  if (!session?.user) {
    if (guestIdDaftar) {
      const guestBooking = db
        .select()
        .from(pendaftaran)
        .where(eq(pendaftaran.id, guestIdDaftar))
        .limit(1)
        .get();
      const isGuestScopedBooking =
        !guestBooking?.userId || guestBooking.userId.startsWith("guest-");

      return NextResponse.json({
        active:
          guestBooking &&
          isGuestScopedBooking &&
          ACTIVE_STATUSES.includes(
            guestBooking.status as (typeof ACTIVE_STATUSES)[number],
          )
            ? guestBooking
            : null,
        history: guestBooking && isGuestScopedBooking ? [guestBooking] : [],
      });
    }

    return NextResponse.json({ active: null, history: [] });
  }

  const role = (session.user as { role?: string }).role;
  const email = session.user.email ?? "";
  const doctorName = doctorNameByEmail[email];

  if (role === "medis" && doctorName) {
    const activeQueue = db
      .select()
      .from(pendaftaran)
      .where(
        and(
          inArray(pendaftaran.status, [...ACTIVE_STATUSES]),
          eq(pendaftaran.dokter, doctorName),
        ),
      )
      .orderBy(desc(pendaftaran.createdAt))
      .all();

    return NextResponse.json({
      active: activeQueue[0] ?? null,
      history: activeQueue,
    });
  }

  if (role === "medis" && email === "siti.vk@trixsehat.com") {
    const activeQueue = db
      .select()
      .from(pendaftaran)
      .where(inArray(pendaftaran.status, [...ACTIVE_STATUSES]))
      .orderBy(desc(pendaftaran.createdAt))
      .all();

    return NextResponse.json({
      active: activeQueue[0] ?? null,
      history: activeQueue,
    });
  }

  if (role === "admin" || role === "super_admin") {
    const activeQueue = db
      .select()
      .from(pendaftaran)
      .where(inArray(pendaftaran.status, [...ACTIVE_STATUSES]))
      .orderBy(desc(pendaftaran.createdAt))
      .all();

    return NextResponse.json({
      active: activeQueue[0] ?? null,
      history: activeQueue,
    });
  }

  const history = db
    .select()
    .from(pendaftaran)
    .where(eq(pendaftaran.userId, session.user.id))
    .orderBy(desc(pendaftaran.createdAt))
    .all();

  const active =
    history.find((item) =>
      ACTIVE_STATUSES.includes(
        item.status as (typeof ACTIVE_STATUSES)[number],
      ),
    ) ?? null;

  return NextResponse.json({ active, history });
}

export async function POST(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const userId = session?.user?.id ?? null;

  const body = (await request.json().catch(() => ({}))) as BookingBody;
  const nik = body.nik?.trim();
  const namaPasien =
    body.namaPasien?.trim() || session?.user?.name || "Tamu TrixSehat";
  const tglKunjungan =
    body.tglKunjungan?.trim() || new Date().toISOString().slice(0, 10);
  const poliklinik = body.poliklinik?.trim() || DEFAULT_POLIKLINIK;
  const dokter = body.dokter?.trim() || DEFAULT_DOKTER;
  const keluhan = body.keluhan?.trim() || null;

  if (!nik || !/^\d{16}$/.test(nik)) {
    return NextResponse.json(
      { error: "ValidationError", message: "NIK harus tepat 16 digit angka." },
      { status: 400 },
    );
  }

  if (userId) {
    const activeBooking = db
      .select()
      .from(pendaftaran)
      .where(
        and(
          eq(pendaftaran.userId, userId),
          inArray(pendaftaran.status, [...ACTIVE_STATUSES]),
        ),
      )
      .limit(1)
      .get();

    if (activeBooking) {
      return NextResponse.json(
        {
          error: "ActiveBookingExists",
          message: "Antrean Anda Sedang Aktif",
          data: activeBooking,
        },
        { status: 409 },
      );
    }
  }

  // KNOWN LIMITATION (MVP/PoC): count-then-insert ini aman selama berjalan dalam
  // satu proses Node dengan better-sqlite3 (synchronous, tidak ada `await` di antara
  // count dan insert). Sebelum deploy multi-instance/serverless, tambahkan unique
  // index pada (tglKunjungan, nomorAntrean) atau transaksi dengan locking eksplisit
  // — lihat catatan di db/index.ts.
  const [{ value: queueCount }] = db
    .select({ value: count() })
    .from(pendaftaran)
    .where(eq(pendaftaran.tglKunjungan, tglKunjungan))
    .all();

  const nomorAntrean = `A-${String(queueCount + 1).padStart(4, "0")}`;
  const id = crypto.randomUUID();

  const booking = {
    id,
    nomorAntrean,
    nik,
    namaPasien,
    tglKunjungan,
    poliklinik,
    dokter,
    keluhan,
    status: "MENUNGGU" as const,
    userId,
  };

  db.insert(pendaftaran).values(booking).run();
  insertNotification(
    { id, userId },
    `Booking antrean ${nomorAntrean} berhasil dibuat untuk ${poliklinik}.`,
  );

  return NextResponse.json({ data: booking }, { status: 201 });
}

export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: "MENUNGGU" | "DIPANGGIL" | "SELESAI" | "BATAL";
    alasanBatal?: string;
    guestIdDaftar?: string;
  };

  if (!session?.user) {
    // Guest menutup notifikasi "janji temu dibatalkan dokter" (arsipkan ke SELESAI).
    // Tanpa cabang ini, request dari acknowledgeCancellationNotice() selalu 401
    // karena tidak membawa guestIdDaftar.
    if (body.id && body.status === "SELESAI") {
      const archivedGuestBooking = db.transaction((tx) => {
        const guestBooking = tx
          .select()
          .from(pendaftaran)
          .where(eq(pendaftaran.id, body.id!))
          .limit(1)
          .get();

        const isUnclaimedGuestBooking =
          !guestBooking?.userId || guestBooking.userId.startsWith("guest-");

        if (!guestBooking || !isUnclaimedGuestBooking || guestBooking.status !== "BATAL") {
          return null;
        }

        tx.update(pendaftaran)
          .set({ status: "SELESAI" })
          .where(eq(pendaftaran.id, guestBooking.id))
          .run();

        return { ...guestBooking, status: "SELESAI" as const };
      });

      if (!archivedGuestBooking) {
        return NextResponse.json(
          { error: "NotFound", message: "Data pembatalan tidak ditemukan." },
          { status: 404 },
        );
      }

      insertNotification(
        { id: archivedGuestBooking.id, userId: archivedGuestBooking.userId },
        `Pemberitahuan pembatalan ${archivedGuestBooking.nomorAntrean} telah ditutup.`,
      );

      return NextResponse.json({ data: archivedGuestBooking });
    }

    const guestIdDaftar = body.guestIdDaftar?.trim();

    if (!guestIdDaftar) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Silakan login untuk membatalkan janji." },
        { status: 401 },
      );
    }

    const cancelledGuestBooking = db.transaction((tx) => {
      const guestBooking = tx
        .select()
        .from(pendaftaran)
        .where(eq(pendaftaran.id, guestIdDaftar))
        .limit(1)
        .get();

      const isUnclaimedGuestBooking =
        !guestBooking?.userId || guestBooking.userId.startsWith("guest-");
      const isActive =
        guestBooking &&
        ACTIVE_STATUSES.includes(
          guestBooking.status as (typeof ACTIVE_STATUSES)[number],
        );

      if (!guestBooking || !isUnclaimedGuestBooking || !isActive) return null;

      tx.update(pendaftaran)
        .set({ status: "BATAL", alasanBatal: "Dibatalkan oleh pasien." })
        .where(eq(pendaftaran.id, guestBooking.id))
        .run();

      return { ...guestBooking, status: "BATAL" as const, alasanBatal: "Dibatalkan oleh pasien." };
    });

    if (!cancelledGuestBooking) {
      return NextResponse.json(
        { error: "NotFound", message: "Tidak ada antrean aktif untuk dibatalkan." },
        { status: 404 },
      );
    }

    insertNotification(
      { id: cancelledGuestBooking.id, userId: cancelledGuestBooking.userId },
      `Antrean ${cancelledGuestBooking.nomorAntrean} berhasil dibatalkan.`,
    );

    return NextResponse.json({ data: cancelledGuestBooking });
  }

  if (body.status && !BOOKING_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: "ValidationError", message: "Status antrean tidak valid." },
      { status: 400 },
    );
  }

  const role = (session.user as { role?: string }).role;

  if (
    (role === "medis" || role === "admin" || role === "super_admin") &&
    body.id &&
    body.status
  ) {
    const email = session.user.email ?? "";
    // Perawat VK (siti.vk@trixsehat.com) dan super_admin/admin perlu mengubah
    // antrean lintas dokter (mis. menyelesaikan antrean darurat), jadi dikecualikan
    // dari pengecekan kepemilikan. Dokter biasa hanya boleh mengubah antrean miliknya.
    const isCrossDoctorExempt =
      role === "super_admin" || role === "admin" || email === "siti.vk@trixsehat.com";

    if (role === "medis" && !isCrossDoctorExempt) {
      const targetBooking = db
        .select({ dokter: pendaftaran.dokter })
        .from(pendaftaran)
        .where(eq(pendaftaran.id, body.id))
        .limit(1)
        .get();
      const doctorName = doctorNameByEmail[email];

      if (!targetBooking || !doctorName || targetBooking.dokter !== doctorName) {
        return NextResponse.json(
          {
            error: "Forbidden",
            message: "Anda tidak berwenang mengubah antrean pasien dokter lain.",
          },
          { status: 403 },
        );
      }
    }

    const nextStatus = body.status;
    const updatePayload =
      nextStatus === "BATAL"
        ? {
            status: nextStatus,
            alasanBatal:
              body.alasanBatal?.trim() || "Janji temu dibatalkan oleh dokter.",
          }
        : { status: nextStatus, alasanBatal: null };

    const updated = db.transaction((tx) => {
      const existingBooking = tx
        .select()
        .from(pendaftaran)
        .where(eq(pendaftaran.id, body.id!))
        .limit(1)
        .get();

      tx.update(pendaftaran)
        .set(updatePayload)
        .where(eq(pendaftaran.id, body.id!))
        .run();

      const nextBooking = tx
        .select()
        .from(pendaftaran)
        .where(eq(pendaftaran.id, body.id!))
        .limit(1)
        .get();

      if (existingBooking && nextBooking) {
        tx.insert(notifikasi)
          .values({
            userId: nextBooking.userId,
            guestIdDaftar: nextBooking.userId ? null : nextBooking.id,
            pesan:
              nextStatus === "BATAL"
                ? `${getStatusNotificationMessage(nextStatus, nextBooking)} Alasan: ${nextBooking.alasanBatal ?? "Tidak ada alasan tertulis."}`
                : getStatusNotificationMessage(nextStatus, nextBooking),
          })
          .run();
      }

      return nextBooking;
    });

    return NextResponse.json({ data: updated });
  }

  if (body.id && body.status === "SELESAI") {
    const archivedBooking = db
      .select()
      .from(pendaftaran)
      .where(
        and(
          eq(pendaftaran.id, body.id),
          eq(pendaftaran.userId, session.user.id),
          eq(pendaftaran.status, "BATAL"),
        ),
      )
      .limit(1)
      .get();

    if (!archivedBooking) {
      return NextResponse.json(
        { error: "NotFound", message: "Data pembatalan tidak ditemukan." },
        { status: 404 },
      );
    }

    db.update(pendaftaran)
      .set({ status: "SELESAI" })
      .where(eq(pendaftaran.id, archivedBooking.id))
      .run();
    insertNotification(
      { id: archivedBooking.id, userId: archivedBooking.userId },
      `Pemberitahuan pembatalan ${archivedBooking.nomorAntrean} telah ditutup.`,
    );

    return NextResponse.json({
      data: {
        ...archivedBooking,
        status: "SELESAI",
      },
    });
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
      { error: "NotFound", message: "Tidak ada antrean aktif." },
      { status: 404 },
    );
  }

  db.update(pendaftaran)
    .set({ status: "BATAL", alasanBatal: "Dibatalkan oleh pasien." })
    .where(eq(pendaftaran.id, activeBooking.id))
    .run();
  insertNotification(
    { id: activeBooking.id, userId: activeBooking.userId },
    `Antrean ${activeBooking.nomorAntrean} berhasil dibatalkan.`,
  );

  return NextResponse.json({
    data: {
      ...activeBooking,
      status: "BATAL",
    },
  });
}
