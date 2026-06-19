import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { notifikasi, pembayaranBilling, pendaftaran, user } from "@/db/schema";
import { getRequestSession } from "@/lib/session";
import { isBpjsActive } from "@/lib/utils";

export const runtime = "nodejs";

type RevenuePeriod = "today" | "week" | "month";

function getPeriodStart(period: RevenuePeriod) {
  const start = new Date();

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return start;
}

export async function GET(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const url = new URL(request.url);
  const guestIdDaftar = url.searchParams.get("id_daftar")?.trim();
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase();
  const requestedPeriod = url.searchParams.get("period") as RevenuePeriod | null;
  let targetUserId = session?.user?.id;

  if (role === "admin" || role === "super_admin") {
    const statusFilter = requestedStatus === "LUNAS" ? "LUNAS" : "TERTUNDA";
    const hasRevenuePeriod =
      statusFilter === "LUNAS" &&
      requestedPeriod &&
      ["today", "week", "month"].includes(requestedPeriod);
    const periodStart = hasRevenuePeriod
      ? getPeriodStart(requestedPeriod)
      : null;
    const periodEnd = new Date();
    const whereClause =
      hasRevenuePeriod && periodStart
        ? and(
            eq(pembayaranBilling.status, statusFilter),
            gte(pembayaranBilling.tglLunas, periodStart),
            lte(pembayaranBilling.tglLunas, periodEnd),
          )
        : eq(pembayaranBilling.status, statusFilter);
    const records = db
      .select({
        id: pembayaranBilling.id,
        userId: pembayaranBilling.userId,
        idRme: pembayaranBilling.idRme,
        idPendaftaran: pembayaranBilling.idPendaftaran,
        namaPasien: user.name,
        nikPasien: user.nik,
        bpjsActive: user.bpjsActive,
        bpjsVerifiedAt: user.bpjsVerifiedAt,
        nomorAntrean: pendaftaran.nomorAntrean,
        poliklinik: pendaftaran.poliklinik,
        dokter: pendaftaran.dokter,
        deskripsi: pembayaranBilling.deskripsi,
        biayaJasaDokter: pembayaranBilling.biayaJasaDokter,
        biayaObat: pembayaranBilling.biayaObat,
        total: pembayaranBilling.total,
        status: pembayaranBilling.status,
        tglLunas: pembayaranBilling.tglLunas,
        createdAt: pembayaranBilling.createdAt,
      })
      .from(pembayaranBilling)
      .leftJoin(user, eq(pembayaranBilling.userId, user.id))
      .leftJoin(pendaftaran, eq(pembayaranBilling.idPendaftaran, pendaftaran.id))
      .where(whereClause)
      .orderBy(
        desc(
          statusFilter === "LUNAS"
            ? pembayaranBilling.tglLunas
            : pembayaranBilling.createdAt,
        ),
      )
      .all();
    const [summary] =
      statusFilter === "LUNAS"
        ? db
            .select({
              total: sql<number>`coalesce(sum(${pembayaranBilling.total}), 0)`.mapWith(Number),
            })
            .from(pembayaranBilling)
            .where(whereClause)
            .all()
        : [{ total: 0 }];

    return NextResponse.json({
      data: records.map(({ bpjsVerifiedAt, ...record }) => ({
        ...record,
        bpjsActive: isBpjsActive(record.bpjsActive, bpjsVerifiedAt),
      })),
      summary,
    });
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
      { error: "Unauthorized", message: "Silakan login untuk melihat tagihan." },
      { status: 401 },
    );
  }

  const records = db
    .select()
    .from(pembayaranBilling)
    .where(
      and(
        eq(pembayaranBilling.userId, targetUserId),
        eq(pembayaranBilling.status, "TERTUNDA"),
      ),
    )
    .orderBy(desc(pembayaranBilling.createdAt))
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
    id?: string;
    status?: "LUNAS";
  };

  if (!body.id) {
    return NextResponse.json(
      { error: "ValidationError", message: "ID tagihan wajib diisi." },
      { status: 400 },
    );
  }

  const result = db.transaction((tx) => {
    const billing = tx
      .select()
      .from(pembayaranBilling)
      .where(eq(pembayaranBilling.id, body.id!))
      .limit(1)
      .get();

    if (!billing) return null;

    const paidAt = new Date();

    tx.update(pembayaranBilling)
      .set({ status: "LUNAS", tglLunas: paidAt })
      .where(eq(pembayaranBilling.id, billing.id))
      .run();

    if (billing.idPendaftaran) {
      tx.update(pendaftaran)
        .set({ status: "SELESAI" })
        .where(eq(pendaftaran.id, billing.idPendaftaran))
        .run();
    }

    tx.insert(notifikasi)
      .values({
        userId: billing.userId.startsWith("guest-") ? null : billing.userId,
        guestIdDaftar: billing.userId.startsWith("guest-")
          ? billing.idPendaftaran
          : null,
        pesan: `Pembayaran Anda sebesar ${new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(billing.total)} telah lunas. Terima kasih.`,
      })
      .run();

    return { ...billing, status: "LUNAS", tglLunas: paidAt };
  });

  if (!result) {
    return NextResponse.json(
      { error: "NotFound", message: "Data tagihan tidak ditemukan." },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: result });
}
