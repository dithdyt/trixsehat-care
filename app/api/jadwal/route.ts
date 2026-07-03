import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { jadwalDokter, user } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

function createSlots(jamMulai: string, jamSelesai: string) {
  const [startHour, startMinute] = jamMulai.split(":").map(Number);
  const [endHour, endMinute] = jamSelesai.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const slots: string[] = [];

  for (let minute = start; minute < end; minute += 30) {
    const hour = Math.floor(minute / 60);
    const rest = minute % 60;
    slots.push(`${String(hour).padStart(2, "0")}:${String(rest).padStart(2, "0")}`);
  }

  return slots;
}

export async function GET(request: Request) {
  ensureDatabase();

  const url = new URL(request.url);
  const dokter = url.searchParams.get("dokter")?.trim();
  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  let dokterId = session?.user?.id;
  if (dokter) {
    const dokterUser = db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.name, dokter))
      .limit(1)
      .get();
    dokterId = dokterUser?.id;
  }

  if (!dokterId) return NextResponse.json({ data: null, slots: [] });

  const schedule = db
    .select()
    .from(jadwalDokter)
    .where(eq(jadwalDokter.dokterId, dokterId))
    .limit(1)
    .get();

  if (!schedule && role === "medis") {
    return NextResponse.json({
      data: null,
      slots: [],
      message: "Dokter belum mengatur jadwal praktek hari ini.",
    });
  }

  if (!schedule) return NextResponse.json({ data: null, slots: [] });

  return NextResponse.json({
    data: schedule,
    slots: createSlots(schedule.jamMulai, schedule.jamSelesai),
  });
}

export async function POST(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "medis" && role !== "super_admin")) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Akses hanya untuk dokter." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    jamMulai?: string;
    jamSelesai?: string;
    kuota?: number;
  };
  const jamMulai = body.jamMulai?.trim();
  const jamSelesai = body.jamSelesai?.trim();

  if (!jamMulai || !jamSelesai) {
    return NextResponse.json(
      { error: "ValidationError", message: "Jam mulai dan selesai wajib diisi." },
      { status: 400 },
    );
  }

  const existing = db
    .select()
    .from(jadwalDokter)
    .where(eq(jadwalDokter.dokterId, session.user.id))
    .limit(1)
    .get();

  if (existing) {
    db.update(jadwalDokter)
      .set({ jamMulai, jamSelesai, kuota: Number(body.kuota ?? existing.kuota) })
      .where(eq(jadwalDokter.id, existing.id))
      .run();
    return NextResponse.json({
      data: { ...existing, jamMulai, jamSelesai, kuota: Number(body.kuota ?? existing.kuota) },
    });
  }

  const schedule = {
    id: crypto.randomUUID(),
    dokterId: session.user.id,
    jamMulai,
    jamSelesai,
    kuota: Number(body.kuota ?? 8),
  };
  db.insert(jadwalDokter).values(schedule).run();

  return NextResponse.json({ data: schedule }, { status: 201 });
}
