"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient, useSession } from "@/lib/auth-client";

type StaffRole = "pasien" | "medis" | "admin" | "super_admin";

async function fetchCurrentRole() {
  const response = await fetch("/api/auth/get-session", {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  return payload?.user?.role as StaffRole | undefined;
}

export default function StaffLoginPage() {
  const router = useRouter();
  const session = useSession();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const role = (session.data?.user as { role?: StaffRole } | undefined)?.role;

  useEffect(() => {
    if (session.isPending) return;
    if (role === "medis") router.replace("/medis");
    if (role === "admin" || role === "super_admin") router.replace("/admin");
    // Catatan: jangan panggil authClient.signOut() di sini. Effect ini juga bisa
    // terpicu murni karena session di browser berubah (mis. tab lain login sebagai
    // pasien) — bukan karena ada upaya login staf yang gagal di halaman ini. Cukup
    // alihkan keluar dari halaman staf tanpa merusak session aktif milik tab lain.
    // Kasus "submit form staf tapi ternyata akun pasien" sudah ditangani terpisah
    // di handleSubmit (dengan signOut yang memang terikat aksi submit di tab ini).
    if (role === "pasien") router.replace("/");
  }, [role, router, session.isPending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Memverifikasi akses staf...");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        setMessage(result.error.message ?? "Login gagal.");
        setIsSubmitting(false);
        return;
      }

      await session.refetch();
      const nextRole = await fetchCurrentRole();

      if (nextRole === "medis") {
        router.replace("/medis");
        return;
      }

      if (nextRole === "admin" || nextRole === "super_admin") {
        router.replace("/admin");
        return;
      }

      await authClient.signOut();
      setMessage("Akses Ditolak. Halaman ini hanya untuk staf internal.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 text-slate-950">
      <div className="pointer-events-none fixed right-[-7rem] top-[-7rem] h-80 w-80 rounded-full bg-teal-300/30 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-8rem] left-[-8rem] h-96 w-96 rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <Card className="w-full rounded-[1.7rem] border-slate-200/80 bg-white/90 shadow-xl backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2.5 font-sans text-2xl font-bold text-[#0F766E]">
              <img
                src="/trixsehat-icon.png"
                alt="TrixSehat Logo"
                className="h-8 w-8 object-contain"
              />
              <span>TrixSehat HIS - Portal Karyawan</span>
            </CardTitle>
            <CardDescription>
              Gerbang masuk tunggal untuk staf medis, kasir, apoteker, dan front
              office.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-600">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="staf@trixsehat.test"
                  className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#0F766E] focus:ring-2"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-600">
                  Password
                </span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#0F766E] focus:ring-2"
                />
              </label>
              {message && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  {message}
                </p>
              )}
              <Button
                disabled={isSubmitting}
                className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700 disabled:bg-slate-300"
              >
                {isSubmitting ? "Memproses..." : "Masuk Portal Karyawan"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
