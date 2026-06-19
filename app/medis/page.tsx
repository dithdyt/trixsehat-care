"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Activity,
  BedDouble,
  ClipboardPlus,
  LogOut,
  Pill,
  Stethoscope,
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

type StaffUser = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type BookingRecord = {
  id: string;
  nomorAntrean: string;
  nik: string;
  namaPasien: string;
  tglKunjungan: string;
  poliklinik: string;
  dokter: string;
  keluhan: string | null;
  alasanBatal: string | null;
  status: "MENUNGGU" | "DIPANGGIL" | "SELESAI" | "BATAL";
  userId: string | null;
};

type QueueApi = {
  active: BookingRecord | null;
  history: BookingRecord[];
};

type KamarApi = {
  data: Array<{
    idKamar: string;
    jenisKamar: string;
    status: RoomStatus;
    idPasien: string | null;
    tipeMasuk: "Pasien Darurat" | "Rujukan Dokter" | null;
    namaPasien: string | null;
    nikPasien: string | null;
  }>;
  logs: Array<{
    id: string;
    idKamar: string;
    status: string;
    actorName: string;
    createdAt: string | number | Date;
  }>;
};

type RoomStatus = "Tersedia" | "Terisi" | "Sedang Dibersihkan" | "Tidak Aktif";

const roomStatuses: RoomStatus[] = [
  "Tersedia",
  "Terisi",
  "Sedang Dibersihkan",
  "Tidak Aktif",
];

const roomStatusClass: Record<RoomStatus, string> = {
  Tersedia: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Terisi: "bg-rose-50 text-rose-600 border-rose-200",
  "Sedang Dibersihkan": "bg-amber-50 text-amber-600 border-amber-200",
  "Tidak Aktif": "bg-slate-100 text-slate-500 border-slate-200",
};
const roomSelectClass: Record<RoomStatus, string> = {
  Tersedia:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70 focus:border-emerald-500 focus:ring-emerald-100",
  Terisi:
    "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/70 focus:border-rose-500 focus:ring-rose-100",
  "Sedang Dibersihkan":
    "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/70 focus:border-amber-500 focus:ring-amber-100",
  "Tidak Aktif":
    "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200/70 focus:border-slate-400 focus:ring-slate-100",
};
const doctorNameByEmail: Record<string, string> = {
  "dr.coralin@trixsehat.com": "dr. Coralin Santoso, Sp.OG",
  "dr.lestari@trixsehat.com": "dr. Lestari Ayuningtyas, Sp.OG",
  "dr.andi@trixsehat.com": "dr. Andi Anemon Wijaya, Sp.A",
  "dr.ratna@trixsehat.com": "dr. Ratna Puspita, Sp.A",
  "dr.bima@trixsehat.com": "dr. Bima Satriya, Sp.PD",
  "dr.farhan@trixsehat.com": "dr. Farhan Mahendra, Sp.B",
  "drg.dinda@trixsehat.com": "drg. Dinda Maharani",
};

const workstationByEmail: Record<string, string> = {
  "dr.coralin@trixsehat.com":
    "Workstation Poliklinik Kebidanan & Kandungan (Obgyn)",
  "dr.lestari@trixsehat.com":
    "Workstation Poliklinik Kebidanan & Kandungan (Obgyn)",
  "dr.andi@trixsehat.com":
    "Workstation Poliklinik Kesehatan Anak (Pediatrik)",
  "dr.ratna@trixsehat.com":
    "Workstation Poliklinik Kesehatan Anak (Pediatrik)",
  "dr.bima@trixsehat.com":
    "Workstation Poliklinik Penyakit Dalam (Internist)",
  "dr.farhan@trixsehat.com": "Workstation Poliklinik Bedah Umum",
  "drg.dinda@trixsehat.com": "Workstation Poliklinik Gigi dan Mulut",
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? "Gagal mengambil data.");
  }

  return payload as T;
};

const formatTime = (value: string | number | Date) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function MedisDashboardPage() {
  const router = useRouter();
  const session = useSession();
  const user = session.data?.user as StaffUser | undefined;
  const [selectedPatient, setSelectedPatient] = useState<BookingRecord | null>(
    null,
  );
  const [cancelTarget, setCancelTarget] = useState<BookingRecord | null>(null);
  const [doctorMessage, setDoctorMessage] = useState("");
  const [nurseMessage, setNurseMessage] = useState("");

  const isSuperAdmin = user?.role === "super_admin";
  const isDoctor = Boolean(user?.email && doctorNameByEmail[user.email]);
  const isNurse = user?.email === "siti.vk@trixsehat.com" || isSuperAdmin;
  const displayName =
    user?.email === "siti.vk@trixsehat.com"
      ? "Siti Kong"
      : (user?.name ?? "Rekan Medis");
  const workstationSubtitle =
    user?.email && workstationByEmail[user.email]
      ? workstationByEmail[user.email]
      : "Workstation Dokter Spesialis";

  const { data: queue, mutate: mutateQueue } = useSWR<QueueApi>(
    user?.role === "medis" || isSuperAdmin ? "/api/booking" : null,
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: kamar, mutate: mutateKamar } = useSWR<KamarApi>(
    user?.role === "medis" || isSuperAdmin ? "/api/kamar" : null,
    fetcher,
    { refreshInterval: 5000 },
  );

  const activeQueue = useMemo(
    () =>
      (queue?.history ?? []).filter((item) =>
        ["MENUNGGU", "DIPANGGIL"].includes(item.status),
      ),
    [queue],
  );
  const vkRooms = useMemo(
    () =>
      (kamar?.data ?? [])
        .sort((left, right) => left.idKamar.localeCompare(right.idKamar)),
    [kamar],
  );
  const emergencyQueue = activeQueue.filter(
    (item) =>
      item.nomorAntrean.startsWith("EMG") ||
      item.keluhan === "Darurat Melahirkan",
  );

  useEffect(() => {
    if (session.isPending) return;
    if (!user || (user.role !== "medis" && user.role !== "super_admin")) {
      router.replace("/staff");
    }
  }, [router, session.isPending, user]);

  if (
    session.isPending ||
    !user ||
    (user.role !== "medis" && user.role !== "super_admin")
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-slate-700">
        Memeriksa akses staf medis...
      </main>
    );
  }

  async function callPatient(patient: BookingRecord) {
    setDoctorMessage(`Memanggil ${patient.namaPasien}...`);
    const response = await fetch("/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: patient.id, status: "DIPANGGIL" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutateQueue();
      setDoctorMessage(`${patient.namaPasien} dipanggil ke ruang dokter.`);
      return;
    }

    setDoctorMessage(payload.message ?? "Gagal memanggil pasien.");
  }

  async function cancelPatientQueue(
    event: FormEvent<HTMLFormElement>,
    patient: BookingRecord,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const alasanBatal = String(form.get("alasanBatal") ?? "").trim();
    setDoctorMessage(`Membatalkan janji temu ${patient.namaPasien}...`);

    const response = await fetch("/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patient.id,
        status: "BATAL",
        alasanBatal,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      if (selectedPatient?.id === patient.id) setSelectedPatient(null);
      setCancelTarget(null);
      await mutateQueue();
      setDoctorMessage(`Janji temu ${patient.namaPasien} dibatalkan.`);
      return;
    }

    setDoctorMessage(payload.message ?? "Gagal membatalkan antrean.");
  }

  async function saveEmr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) return;

    setDoctorMessage("Menyimpan EMR dan mengirim resep...");
    const form = new FormData(event.currentTarget);
    const resepObat = [1, 2, 3]
      .map((index) => ({
        nama: String(form.get(`obat${index}`) ?? "").trim(),
        dosis: String(form.get(`dosis${index}`) ?? "").trim(),
        harga: Number(form.get(`harga${index}`) ?? 0),
      }))
      .filter((item) => item.nama);

    const response = await fetch("/api/simulate-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idPendaftaran: selectedPatient.id,
        soap: form.get("soap"),
        diagnosaIcd10: form.get("diagnosaIcd10"),
        tindakanMedis: form.get("tindakanMedis"),
        resepObat,
        rujukVk: form.get("rujukVk") === "on",
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      setSelectedPatient(null);
      await mutateQueue();
      setDoctorMessage(
        "Rekam Medis (EMR) & Resep Digital otomatis tersinkronisasi ke Apotek dan Kasir.",
      );
      return;
    }

    setDoctorMessage(payload.message ?? "Gagal menyimpan EMR.");
  }

  async function handleLogout() {
    await authClient.signOut();
    router.replace("/staff");
  }

  async function updateRoomStatus(idKamar: string, nextStatus: RoomStatus) {
    setNurseMessage(`Memperbarui ${idKamar}...`);

    const response = await fetch("/api/kamar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idKamar, status: nextStatus }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutateKamar();
      setNurseMessage(`${idKamar} diubah menjadi ${nextStatus}.`);
      return;
    }

    setNurseMessage(payload.message ?? "Gagal memperbarui kamar.");
  }

  async function completeEmergencyQueue(item: BookingRecord) {
    setNurseMessage(`Menyelesaikan antrean ${item.nomorAntrean}...`);

    const response = await fetch("/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: "SELESAI" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutateQueue();
      setNurseMessage(
        `${item.nomorAntrean} selesai. Pasien darurat sudah dialokasikan ke kamar.`,
      );
      return;
    }

    setNurseMessage(payload.message ?? "Gagal menyelesaikan antrean darurat.");
  }

  if (!isDoctor && !isNurse && !isSuperAdmin) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 text-slate-950">
        <div className="mx-auto max-w-4xl">
          <Card className="rounded-[1.7rem] border-slate-200/80 bg-white shadow-xl">
            <CardHeader>
              <CardTitle className="font-sans text-3xl font-bold text-[#0F766E]">
                TrixSehat Clinical Dashboard
              </CardTitle>
              <CardDescription>
                Akun medis ini belum dipetakan ke workstation dokter atau VK.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-slate-700">
              Login menggunakan akun dokter terdaftar untuk workstation Dokter
              atau `siti.vk@trixsehat.com` untuk Perawat VK.
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 font-sans text-slate-950">
      <div className="pointer-events-none fixed right-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-8rem] left-[-8rem] h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <nav className="sticky top-4 z-30 rounded-[2rem] border border-white/80 bg-white/80 px-5 py-4 shadow-xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => router.replace("/medis")}
              className="flex items-center gap-2.5 font-sans text-xl font-bold text-[#0F766E]"
            >
              <img
                src="/trixsehat-icon.png"
                alt="TrixSehat Logo"
                className="h-8 w-8 object-contain"
              />
              <span>TrixSehat HIS</span>
            </button>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-full border-teal-100 bg-white/70 text-[#0F766E]"
                onClick={() => router.replace("/medis")}
              >
                Beranda/Dashboard
              </Button>
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  className="rounded-full border-teal-100 bg-teal-50 text-[#0F766E]"
                  onClick={() => router.replace("/admin")}
                >
                  Beralih ke Dashboard Admin
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
            TrixSehat Clinical Dashboard
          </p>
          <h1 className="mt-2 font-sans text-3xl font-bold">
            Selamat bekerja, {displayName}
          </h1>
          <p className="mt-2 text-slate-600">
            {isDoctor
              ? workstationSubtitle
              : "Workstation Perawat VK: antrean darurat, kompilasi ketersediaan kamar, dan log aktivitas."}
          </p>
        </header>

        {isDoctor ? (
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
            <Card className="rounded-[1.7rem] bg-white shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans font-bold">
                  <Stethoscope className="h-5 w-5 text-[#0F766E]" />
                  Daftar Antrean Aktif
                </CardTitle>
                <CardDescription>
                  Data real-time dari tabel pendaftaran.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-600">
                    Tidak ada antrean aktif.
                  </div>
                ) : (
                  activeQueue.map((patient) => (
                    <div
                      key={patient.id}
                      className={cn(
                        "rounded-2xl border bg-slate-50 p-4",
                        selectedPatient?.id === patient.id &&
                          "border-teal-300 bg-teal-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-lg font-bold text-[#0F766E]">
                            {patient.nomorAntrean}
                          </p>
                          <p className="font-semibold">{patient.namaPasien}</p>
                          <p className="text-xs text-slate-500">
                            NIK {patient.nik} | {patient.poliklinik}
                          </p>
                        </div>
                        <Badge>{patient.status}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          onClick={() => callPatient(patient)}
                          variant="outline"
                          className="rounded-full"
                        >
                          Panggil Pasien
                        </Button>
                        <Button
                          onClick={() => setSelectedPatient(patient)}
                          className="rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
                        >
                          Buka EMR
                        </Button>
                        <Button
                          onClick={() => setCancelTarget(patient)}
                          variant="outline"
                          className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          Batalkan
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                {doctorMessage && (
                  <p
                    className={cn(
                      doctorMessage.startsWith("Gagal")
                        ? "rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700"
                        : "mt-2 block font-sans text-xs text-slate-400",
                    )}
                  >
                    {doctorMessage}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[1.7rem] bg-white shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans font-bold">
                  <ClipboardPlus className="h-5 w-5 text-[#0F766E]" />
                  EMR & E-Prescription
                </CardTitle>
                <CardDescription>
                  Simulasi Fase B/C dokter, apoteker, dan kasir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedPatient ? (
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-slate-600">
                    Pilih pasien dan klik &quot;Buka EMR&quot; untuk mulai pemeriksaan.
                  </div>
                ) : (
                  <form onSubmit={saveEmr} className="space-y-4">
                    <div className="grid gap-3 rounded-2xl border bg-teal-50/60 p-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase text-slate-500">
                          Pasien
                        </p>
                        <p className="font-semibold">{selectedPatient.namaPasien}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-slate-500">
                          NIK
                        </p>
                        <p className="font-mono font-semibold">
                          {selectedPatient.nik}
                        </p>
                      </div>
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Catatan Medis (SOAP)
                      </span>
                      <textarea
                        name="soap"
                        required
                        rows={4}
                        defaultValue={selectedPatient.keluhan ?? ""}
                        className="w-full rounded-xl border bg-slate-50 px-3 py-3 outline-none ring-[#0F766E] focus:ring-2"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Diagnosa ICD-10
                      </span>
                      <input
                        name="diagnosaIcd10"
                        required
                        list="icd10-options"
                        defaultValue="Z34.8 - Supervision of other normal pregnancy"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#0F766E] focus:ring-2"
                      />
                      <datalist id="icd10-options">
                        <option value="Z34.8 - Supervision of other normal pregnancy" />
                        <option value="O80 - Single spontaneous delivery" />
                        <option value="O47.9 - False labor, unspecified" />
                        <option value="O60.0 - Preterm labor without delivery" />
                        <option value="N39.0 - Urinary tract infection, site not specified" />
                      </datalist>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Tindakan Medis
                      </span>
                      <input
                        name="tindakanMedis"
                        required
                        defaultValue="Konsultasi dokter spesialis dan resep digital"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#0F766E] focus:ring-2"
                      />
                    </label>
                    <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
                      <div className="flex items-center gap-2 font-semibold">
                        <Pill className="h-4 w-4 text-[#0F766E]" />
                        Resep Obat
                      </div>
                      {[1, 2, 3].map((index) => (
                        <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
                          <input
                            name={`obat${index}`}
                            placeholder="Nama obat"
                            defaultValue={
                              index === 1 ? "Asam folat 400 mcg" : ""
                            }
                            className="h-10 rounded-xl border bg-white px-3 text-sm outline-none ring-[#0F766E] focus:ring-2"
                          />
                          <input
                            name={`dosis${index}`}
                            placeholder="Dosis"
                            defaultValue={index === 1 ? "1 tablet, 1x sehari" : ""}
                            className="h-10 rounded-xl border bg-white px-3 text-sm outline-none ring-[#0F766E] focus:ring-2"
                          />
                          <input
                            name={`harga${index}`}
                            type="number"
                            min={0}
                            placeholder="Harga"
                            defaultValue={index === 1 ? 42000 : 0}
                            className="h-10 rounded-xl border bg-white px-3 font-mono text-sm outline-none ring-[#0F766E] focus:ring-2"
                          />
                        </div>
                      ))}
                    </div>
                    <label className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
                      <input
                        name="rujukVk"
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[#0F766E]"
                      />
                      <span>
                        <span className="block font-semibold text-slate-900">
                          Rujuk Rawat Inap/VK
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-slate-600">
                          Jika dicentang, sistem otomatis memesan 1 kamar rawat
                          kosong dan mencatat kategori masuk sebagai Rujukan
                          Dokter.
                        </span>
                      </span>
                    </label>
                    <Button className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700">
                      Simpan & Kirim Resep
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[0.75fr_1.35fr]">
            <Card className="rounded-[1.7rem] bg-white shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans font-bold text-rose-600">
                  <Activity className="h-5 w-5" />
                  Antrean Darurat
                </CardTitle>
                <CardDescription>
                  Respons IGD maternal dan antrean EMG aktif.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {emergencyQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-600">
                    Tidak ada antrean darurat aktif.
                  </div>
                ) : (
                  emergencyQueue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border bg-rose-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xl font-bold text-rose-600">
                            {item.nomorAntrean}
                          </p>
                          <p className="truncate font-semibold">
                            {item.namaPasien}
                          </p>
                          <p className="text-sm text-slate-600">
                            {item.keluhan ?? "Darurat maternal"} | {item.status}
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => completeEmergencyQueue(item)}
                          className="shrink-0 rounded-full bg-[#0F766E] px-4 text-xs font-semibold text-white hover:bg-teal-700"
                        >
                          Selesai
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[1.7rem] bg-white shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans font-bold">
                  <BedDouble className="h-5 w-5 text-[#0F766E]" />
                  Live Ward Tracker Controller
                </CardTitle>
                <CardDescription>
                  Pilih status kamar dan perubahan tersimpan langsung ke database.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {vkRooms.map((room) => (
                    <div
                      key={room.idKamar}
                      className="flex min-h-[160px] w-full flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"
                    >
                      <div className="flex w-full items-center justify-between gap-4">
                        <div className="min-w-0 pr-2">
                          <p className="font-sans text-lg font-bold text-slate-900">
                            {room.idKamar}
                          </p>
                          <p className="mt-1 block text-xs text-slate-400">
                            {room.jenisKamar}
                          </p>
                        </div>
                        <select
                          value={room.status}
                          onChange={(event) =>
                            updateRoomStatus(
                              room.idKamar,
                              event.target.value as RoomStatus,
                            )
                          }
                          className={cn(
                            "h-10 w-36 flex-shrink-0 rounded-lg border px-3 text-xs font-semibold outline-none transition-all duration-200 focus:ring-2",
                            roomSelectClass[room.status],
                          )}
                          aria-label={`Status ${room.idKamar}`}
                        >
                          {roomStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                      {room.status === "Terisi" && (
                        <div className="mt-auto border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
                          <p className="break-words font-semibold text-slate-900">
                            {room.namaPasien ?? "Data pasien belum terhubung"}
                          </p>
                          <p className="break-words font-mono">
                            NIK {room.nikPasien ?? "-"}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-2 max-w-full rounded-full border-teal-200 bg-teal-50 text-[#0F766E]"
                          >
                            <span className="truncate">
                              {room.tipeMasuk ?? "Kategori belum tercatat"}
                            </span>
                          </Badge>
                        </div>
                      )}
                      {room.status !== "Terisi" && (
                        <p className="mt-auto border-t border-slate-100 pt-3 text-xs text-slate-400">
                          Belum ada pasien terhubung.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {nurseMessage && (
                  <p className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                    {nurseMessage}
                  </p>
                )}
                <div className="rounded-2xl border bg-white">
                  <div className="border-b px-4 py-3 font-semibold">
                    Log Aktivitas
                  </div>
                  <div className="divide-y">
                    {(kamar?.logs ?? []).length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">
                        Belum ada aktivitas perubahan kamar.
                      </p>
                    ) : (
                      kamar?.logs.map((log) => (
                        <div
                          key={log.id}
                          className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[90px_1fr_1fr_1fr]"
                        >
                          <span className="font-mono text-slate-500">
                            {formatTime(log.createdAt)}
                          </span>
                          <span>Kamar {log.idKamar}</span>
                          <span>Diubah menjadi {log.status}</span>
                          <span>Oleh {log.actorName || "Siti Kong"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
      {cancelTarget && (
        <CancelQueueModal
          patient={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSubmit={(event) => cancelPatientQueue(event, cancelTarget)}
        />
      )}
    </main>
  );
}

function CancelQueueModal({
  patient,
  onClose,
  onSubmit,
}: {
  patient: BookingRecord;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg rounded-[1.7rem] border-rose-100 bg-white shadow-2xl">
        <CardHeader>
          <CardTitle className="font-sans text-2xl font-bold text-rose-600">
            Batalkan Janji Temu Pasien {patient.namaPasien}
          </CardTitle>
          <CardDescription>
            Alasan ini akan tampil sebagai pemberitahuan di Portal Pasien.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Alasan Pembatalan
              </span>
              <textarea
                name="alasanBatal"
                required
                rows={4}
                placeholder="Dokter ada tindakan operasi darurat"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rose-200 focus:ring-2"
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-full"
              >
                Kembali
              </Button>
              <Button className="rounded-full bg-rose-600 text-white hover:bg-rose-700">
                Simpan Pembatalan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
