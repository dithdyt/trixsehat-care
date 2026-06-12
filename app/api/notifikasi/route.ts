import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureDatabase } from "@/db/init";
import { notifikasi } from "@/db/schema";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

function getGuestId(request: Request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("id_daftar")?.trim() ||
    url.searchParams.get("guest_id_daftar")?.trim() ||
    ""
  );
}

export async function GET(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const guestIdDaftar = getGuestId(request);

  if (!session?.user && !guestIdDaftar) {
    return NextResponse.json({ data: [], unreadCount: 0 });
  }

  const records = db
    .select()
    .from(notifikasi)
    .where(
      session?.user
        ? eq(notifikasi.userId, session.user.id)
        : eq(notifikasi.guestIdDaftar, guestIdDaftar),
    )
    .orderBy(desc(notifikasi.tglNotif))
    .limit(20)
    .all();

  return NextResponse.json({
    data: records,
    unreadCount: records.filter((item) => !item.isRead).length,
  });
}

export async function PATCH(request: Request) {
  ensureDatabase();

  const session = await getRequestSession(request);
  const body = (await request.json().catch(() => ({}))) as {
    guestIdDaftar?: string;
  };
  const guestIdDaftar = body.guestIdDaftar?.trim();

  if (!session?.user && !guestIdDaftar) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Target notifikasi tidak valid." },
      { status: 401 },
    );
  }

  db.update(notifikasi)
    .set({ isRead: true })
    .where(
      and(
        session?.user
          ? eq(notifikasi.userId, session.user.id)
          : eq(notifikasi.guestIdDaftar, guestIdDaftar!),
        eq(notifikasi.isRead, false),
      ),
    )
    .run();

  return NextResponse.json({ success: true });
}
