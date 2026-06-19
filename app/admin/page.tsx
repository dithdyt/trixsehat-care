"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Banknote,
  CheckCircle2,
  FileText,
  LogOut,
  Pill,
  ReceiptText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AdminUser = {
  name?: string | null;
  role?: string | null;
};

type PrescriptionItem = {
  nama: string;
  dosis: string;
  harga: number;
  qty?: number;
};

type PharmacyRecord = {
  idRme: string;
  userId: string;
  namaPasien: string | null;
  nikPasien: string | null;
  bpjsActive: boolean;
  keluhanUtama: string;
  diagnosaIcd10: string;
  tindakanMedis: string;
  resepObat: PrescriptionItem[] | null;
  statusResep: string;
  createdAt: string | number | Date;
};

type PharmacyApi = {
  data: PharmacyRecord[];
};

type BillingRecord = {
  id: string;
  userId: string;
  idRme: string | null;
  idPendaftaran: string | null;
  namaPasien: string | null;
  nikPasien: string | null;
  bpjsActive: boolean;
  nomorAntrean: string | null;
  poliklinik: string | null;
  dokter: string | null;
  deskripsi: string;
  biayaJasaDokter: number;
  biayaObat: number;
  total: number;
  status: "TERTUNDA" | "LUNAS";
  tglLunas: string | number | Date | null;
  createdAt: string | number | Date;
};

type BillingApi = {
  data: BillingRecord[];
  summary?: {
    total: number;
  };
};

type RevenuePeriod = "today" | "week" | "month";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? "Gagal mengambil data.");
  }

  return payload as T;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function periodLabel(period: RevenuePeriod) {
  if (period === "today") return "Hari ini";
  if (period === "week") return "Minggu ini";
  return "Bulan ini";
}

function isWithinPeriod(value: string | number | Date, period: RevenuePeriod) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);

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

  return date >= start && date <= now;
}

function getAccountingDate(record: BillingRecord) {
  return record.tglLunas ?? record.createdAt;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const session = useSession();
  const user = session.data?.user as AdminUser | undefined;
  const [pharmacyMessage, setPharmacyMessage] = useState("");
  const [billingMessage, setBillingMessage] = useState("");
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>("today");
  const isInternalAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (session.isPending) return;
    if (!user || !["admin", "super_admin"].includes(user.role ?? "")) {
      router.replace("/staff");
    }
  }, [router, session.isPending, user]);

  const { data: pharmacy, mutate: mutatePharmacy } = useSWR<PharmacyApi>(
    isInternalAdmin ? "/api/resep" : null,
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: billing, mutate: mutateBilling } = useSWR<BillingApi>(
    isInternalAdmin ? "/api/billing" : null,
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: paidBilling, mutate: mutatePaidBilling } = useSWR<BillingApi>(
    isInternalAdmin ? `/api/billing?status=LUNAS&period=${revenuePeriod}` : null,
    fetcher,
    { refreshInterval: 5000 },
  );

  const prescriptionQueue = pharmacy?.data ?? [];
  const billingQueue = billing?.data ?? [];
  const paidRecords = paidBilling?.data ?? [];
  const filteredPaidRecords = useMemo(
    () =>
      paidRecords.filter((record) =>
        isWithinPeriod(getAccountingDate(record), revenuePeriod),
      ),
    [paidRecords, revenuePeriod],
  );
  const revenueTotal = useMemo(
    () =>
      paidBilling?.summary?.total ??
      filteredPaidRecords.reduce((sum, item) => sum + item.total, 0),
    [filteredPaidRecords, paidBilling?.summary?.total],
  );
  const billingTotal = useMemo(
    () => billingQueue.reduce((sum, item) => sum + item.total, 0),
    [billingQueue],
  );

  async function handleLogout() {
    await authClient.signOut();
    router.replace("/staff");
  }

  async function completePrescription(record: PharmacyRecord) {
    setPharmacyMessage(`Memproses resep ${record.idRme}...`);

    const response = await fetch("/api/resep", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idRme: record.idRme, statusResep: "Siap diambil" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutatePharmacy();
      setPharmacyMessage(`Resep ${record.idRme} siap diambil pasien.`);
      return;
    }

    setPharmacyMessage(payload.message ?? "Gagal memperbarui status resep.");
  }

  async function confirmPayment(record: BillingRecord) {
    setBillingMessage(`Mengonfirmasi pembayaran ${record.id}...`);

    const response = await fetch("/api/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, status: "LUNAS" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await Promise.all([mutateBilling(), mutatePaidBilling(), mutatePharmacy()]);
      setBillingMessage(`Pembayaran ${formatCurrency(record.total)} sudah lunas.`);
      return;
    }

    setBillingMessage(payload.message ?? "Gagal mengonfirmasi pembayaran.");
  }

  if (session.isPending || !user || !isInternalAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-slate-700">
        Memeriksa akses staf admin...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-slate-950">
      <div className="hidden print:block absolute inset-0 bg-white p-10 text-black">
        <div className="border-b-2 border-black pb-5 text-center">
          <h1 className="font-sans text-2xl font-bold">RSU TrixSehat</h1>
          <p className="mt-1 text-sm">
            Jl. Cipulir Raya, Jakarta Selatan | Telp. 021-0000-TRIX
          </p>
          <h2 className="mt-4 font-sans text-xl font-bold">
            LAPORAN REKAPITULASI PENDAPATAN
          </h2>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <p>Periode Cetak: {periodLabel(revenuePeriod)}</p>
          <p>Waktu Cetak: {formatDateTime(new Date())}</p>
          <p>Dicetak Oleh: {user.name ?? "Admin TrixSehat"}</p>
          <p>Total Pendapatan: {formatCurrency(revenueTotal)}</p>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr>
              {["ID Billing", "Nama Pasien", "Layanan", "Total Biaya"].map(
                (heading) => (
                  <th key={heading} className="border border-black px-3 py-2 text-left">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filteredPaidRecords.map((record) => (
              <tr key={record.id}>
                <td className="border border-black px-3 py-2 font-mono">
                  {record.id}
                </td>
                <td className="border border-black px-3 py-2">
                  {record.namaPasien ?? "Pasien TrixSehat"}
                </td>
                <td className="border border-black px-3 py-2">
                  {record.poliklinik ?? record.deskripsi}
                </td>
                <td className="border border-black px-3 py-2 font-mono">
                  {formatCurrency(record.total)}
                </td>
              </tr>
            ))}
            {filteredPaidRecords.length === 0 && (
              <tr>
                <td className="border border-black px-3 py-4 text-center" colSpan={4}>
                  Tidak ada transaksi lunas pada periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-24 grid grid-cols-2 gap-16 text-center text-sm">
          <div>
            <p>Dibuat Oleh,</p>
            <div className="h-24" />
            <p className="font-bold">{user.name ?? "Admin TrixSehat"}</p>
          </div>
          <div>
            <p>Mengetahui,</p>
            <p>Direktur Utama RSU TrixSehat,</p>
            <div className="h-20" />
            <p className="font-bold">Azka Sapling</p>
          </div>
        </div>
      </div>

      <div className="print:hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-10 top-10 h-72 w-72 rounded-full bg-[#14B8A6]/20 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-8">
        <nav className="sticky top-5 z-20 rounded-[2rem] border border-white/80 bg-white/80 px-5 py-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <img
                  src="/trixsehat-icon.png"
                  alt="TrixSehat Logo"
                  className="h-8 w-8 object-contain"
                />
                <p className="font-sans text-2xl font-bold text-[#0F766E]">
                  TrixSehat HIS
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Portal Admin Kasir & Farmasi Terpadu
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-full border-teal-100 bg-white/70 text-[#0F766E]"
                onClick={() => router.replace("/admin")}
              >
                Beranda/Dashboard
              </Button>
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  className="rounded-full border-teal-100 bg-teal-50 text-[#0F766E]"
                  onClick={() => router.replace("/medis")}
                >
                  Beralih ke Dashboard Medis
                </Button>
              )}
              <Button
                onClick={handleLogout}
                className="rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
              >
                <LogOut className="h-4 w-4" />
                Keluar (Logout)
              </Button>
            </div>
          </div>
        </nav>

        <header className="rounded-[1.7rem] border border-white/80 bg-white/85 p-6 shadow-xl backdrop-blur">
          <p className="text-sm font-semibold text-[#0F766E]">
            TrixSehat Operations Dashboard
          </p>
          <h1 className="mt-2 font-sans text-3xl font-bold">
            Selamat bekerja, {user.name ?? "Admin Staff TrixSehat"}
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Kelola antrean resep farmasi dan konfirmasi pembayaran pasien dalam
            satu layar operasional yang tersinkronisasi dengan database.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Resep diproses", prescriptionQueue.length],
              ["Tagihan tertunda", billingQueue.length],
              ["Total kasir", formatCurrency(billingTotal)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </header>

        <section className="grid h-[70vh] min-h-[600px] gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="flex min-h-0 flex-col rounded-[1.7rem] bg-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-sans font-bold">
                <Pill className="h-5 w-5 text-[#0F766E]" />
                Antrean Resep Farmasi
              </CardTitle>
              <CardDescription>
                Resep dengan status Diproses apotek dan siap diracik.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              {pharmacyMessage && (
                <p className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  {pharmacyMessage}
                </p>
              )}
              <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto pr-2">
                {prescriptionQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Tidak ada antrean resep farmasi.
                  </div>
                ) : (
                  prescriptionQueue.map((record) => (
                  <div key={record.idRme} className="rounded-3xl border bg-slate-50/70 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-xs font-semibold text-[#0F766E]">
                          {record.idRme.slice(0, 8).toUpperCase()}
                        </p>
                        <h2 className="mt-1 font-sans text-lg font-bold">
                          {record.namaPasien ?? "Pasien TrixSehat"}
                          {record.bpjsActive && (
                            <span className="ml-2 text-sm font-semibold text-[#0F766E]">
                              (BPJS)
                            </span>
                          )}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          NIK {record.nikPasien ?? "-"} | {formatTime(record.createdAt)}
                        </p>
                      </div>
                      <Badge className="rounded-full bg-amber-50 text-amber-700">
                        {record.statusResep}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      {(record.resepObat ?? []).map((item) => (
                        <div
                          key={`${record.idRme}-${item.nama}`}
                          className="rounded-2xl border bg-white px-4 py-3"
                        >
                          <p className="font-semibold text-slate-900">{item.nama}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.dosis}</p>
                          <p className="mt-1 font-mono text-sm font-bold text-[#0F766E]">
                            {formatCurrency(item.harga)}
                            {item.qty && item.qty > 1 ? ` x ${item.qty}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => completePrescription(record)}
                      className="mt-5 w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Serahkan Obat & Potong Stok
                    </Button>
                  </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col rounded-[1.7rem] bg-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-sans font-bold">
                <ReceiptText className="h-5 w-5 text-[#0F766E]" />
                Konfirmasi Pembayaran & Billing
              </CardTitle>
              <CardDescription>
                Tagihan tertunda yang menunggu konfirmasi kasir.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              {billingMessage && (
                <p className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  {billingMessage}
                </p>
              )}
              <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto pr-2">
                {billingQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Tidak ada tagihan tertunda.
                  </div>
                ) : (
                  billingQueue.map((record) => {
                  const jasaKonsultasi = record.biayaJasaDokter || 120000;
                  const administrasi = 50000;
                  const farmasi = record.biayaObat || 0;
                  const rows = [
                    ["Jasa Konsultasi Dokter", jasaKonsultasi],
                    ["Administrasi", administrasi],
                    ["Farmasi", farmasi],
                  ] as const;
                  const total = record.total || rows.reduce((sum, [, value]) => sum + value, 0);

                  return (
                    <div key={record.id} className="rounded-3xl border bg-slate-50/70 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-mono text-xs font-semibold text-[#0F766E]">
                            {record.nomorAntrean ?? record.id.slice(0, 8).toUpperCase()}
                          </p>
                          <h2 className="mt-1 font-sans text-lg font-bold">
                            {record.namaPasien ?? "Pasien TrixSehat"}
                            {record.bpjsActive && (
                              <span className="ml-2 text-sm font-semibold text-[#0F766E]">
                                (BPJS)
                              </span>
                            )}
                          </h2>
                          <p className="mt-1 text-xs text-slate-500">
                            {record.poliklinik ?? "Kunjungan pasien"} | {record.dokter ?? "Dokter TrixSehat"}
                          </p>
                        </div>
                        <Badge className="rounded-full bg-rose-50 text-rose-700">
                          Belum lunas
                        </Badge>
                      </div>

                      <div className="mt-5 rounded-2xl border bg-white p-4">
                        <div className="flex items-center gap-2 border-b pb-3">
                          <Banknote className="h-4 w-4 text-[#0F766E]" />
                          <p className="font-semibold">Rincian Kuitansi</p>
                        </div>
                        <div className="mt-4 space-y-3">
                          {rows.map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-slate-600">{label}</span>
                              <span className="font-mono font-semibold">
                                {formatCurrency(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#E0F2F1] p-4 text-[#0F766E]">
                          <span className="font-semibold">Total pembayaran</span>
                          <span className="font-mono text-xl font-bold">
                            {formatCurrency(total)}
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => confirmPayment(record)}
                        className={cn(
                          "mt-5 w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700",
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Konfirmasi Pembayaran (Lunas)
                      </Button>
                    </div>
                  );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-[1.7rem] bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-sans font-bold">
              <FileText className="h-5 w-5 text-[#0F766E]" />
              Ringkasan Pendapatan
            </CardTitle>
            <CardDescription>
              Agregasi transaksi lunas untuk kebutuhan FinOps dan pembukuan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {(["today", "week", "month"] as RevenuePeriod[]).map((period) => (
                  <Button
                    key={period}
                    type="button"
                    variant={revenuePeriod === period ? "default" : "outline"}
                    onClick={() => setRevenuePeriod(period)}
                    className={cn(
                      "rounded-full",
                      revenuePeriod === period && "bg-[#0F766E] text-white hover:bg-teal-700",
                    )}
                  >
                    {periodLabel(period)}
                  </Button>
                ))}
              </div>
              <Button
                onClick={() => window.print()}
                className="rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
              >
                Ekspor Pembukuan (PDF)
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-3xl border bg-[#E0F2F1] p-6 text-[#0F766E]">
                <p className="text-sm font-semibold">Total pendapatan lunas</p>
                <p className="mt-2 font-mono text-4xl font-bold">
                  {formatCurrency(revenueTotal)}
                </p>
                <p className="mt-2 text-sm">
                  {filteredPaidRecords.length} transaksi pada periode{" "}
                  {periodLabel(revenuePeriod).toLowerCase()}.
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-3xl border bg-slate-50">
                {filteredPaidRecords.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    Belum ada transaksi lunas pada periode ini.
                  </p>
                ) : (
                  filteredPaidRecords.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-0"
                    >
                      <div>
                        <p className="font-semibold">
                          {record.namaPasien ?? "Pasien TrixSehat"}
                          {record.bpjsActive && (
                            <span className="ml-2 text-sm font-semibold text-[#0F766E]">
                              (BPJS)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.poliklinik ?? record.deskripsi} | Lunas{" "}
                          {formatDateTime(getAccountingDate(record))}
                        </p>
                      </div>
                      <p className="font-mono font-bold text-[#0F766E]">
                        {formatCurrency(record.total)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </main>
  );
}
