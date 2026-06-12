"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Baby,
  BedDouble,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  IdCard,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  ShieldAlert,
  Siren,
  Sparkles,
  UserRound,
  X,
  XCircle,
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

type ActiveTab =
  | "dashboard"
  | "janji-temu"
  | "riwayat"
  | "kesehatan-ibu"
  | "kesehatan-anak"
  | "profil"
  | "booking";

type AuthMode = "masuk" | "daftar";

type KamarApi = {
  data: Array<{
    idKamar: string;
    jenisKamar: string;
    status: "Tersedia" | "Terisi" | "Sedang Dibersihkan" | "Tidak Aktif";
    idPasien: string | null;
  }>;
  summary: Record<string, { total: number; available: number }>;
};

type ResepApi = {
  data: Array<{
    idRme: string;
    keluhanUtama: string;
    diagnosaIcd10: string;
    tindakanMedis: string;
    statusResep: string;
    resepObat:
      | Array<{
          nama: string;
          dosis: string;
          harga: number;
        }>
      | null;
  }>;
};

type BookingApi = {
  active: BookingRecord | null;
  history: BookingRecord[];
};

type BillingApi = {
  data: Array<{
    id: string;
    deskripsi: string;
    biayaJasaDokter: number;
    biayaObat: number;
    total: number;
    status: "TERTUNDA" | "LUNAS";
  }>;
};

type NotifikasiApi = {
  data: Array<{
    id: number;
    userId: string | null;
    guestIdDaftar: string | null;
    pesan: string;
    tglNotif: string | number | Date;
    isRead: boolean;
  }>;
  unreadCount: number;
};

type AppToast = {
  type: "success" | "error";
  message: string;
} | null;

type EmergencyTicket = {
  booking: BookingRecord;
  assignedRoom: string;
} | null;

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

const navItems: Array<{ id: ActiveTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "janji-temu", label: "Janji Temu" },
  { id: "riwayat", label: "Riwayat" },
  { id: "kesehatan-ibu", label: "Status Kamar" },
  { id: "kesehatan-anak", label: "Kesehatan Anak" },
  { id: "profil", label: "Profil" },
];

const clinicOptions = [
  "Poliklinik Kebidanan & Kandungan (Obgyn)",
  "Poliklinik Kesehatan Anak (Pediatrik)",
  "Poliklinik Penyakit Dalam (Internist)",
  "Poliklinik Bedah Umum",
  "Poliklinik Gigi dan Mulut",
];

const doctorsByClinic: Record<string, string[]> = {
  "Poliklinik Kebidanan & Kandungan (Obgyn)": [
    "dr. Coralin Santoso, Sp.OG",
    "dr. Lestari Ayuningtyas, Sp.OG",
  ],
  "Poliklinik Kesehatan Anak (Pediatrik)": [
    "dr. Andi Anemon Wijaya, Sp.A",
    "dr. Ratna Puspita, Sp.A",
  ],
  "Poliklinik Penyakit Dalam (Internist)": [
    "dr. Bima Satriya, Sp.PD",
  ],
  "Poliklinik Bedah Umum": ["dr. Farhan Mahendra, Sp.B"],
  "Poliklinik Gigi dan Mulut": ["drg. Dinda Maharani"],
};

const roomStatusBadgeClass: Record<KamarApi["data"][number]["status"], string> = {
  Tersedia: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Terisi: "border-rose-200 bg-rose-50 text-rose-700",
  "Sedang Dibersihkan": "border-amber-200 bg-amber-50 text-amber-700",
  "Tidak Aktif": "border-slate-200 bg-slate-100 text-slate-500",
};

const bills = [
  ["Administrasi", 35000],
  ["Konsultasi dokter", 125000],
  ["Obat & vitamin", 0],
  ["Diskon asuransi", -41000],
];

const pageClass =
  "section-panel animate-card space-y-10 opacity-100 translate-y-0 transition-all duration-300";

const lockedMessage =
  "Silakan masuk atau daftar akun TrixSehat terlebih dahulu untuk memantau Rekam Medis Elektronik (RME), Resep Digital, dan mendapatkan integrasi klaim otomatis BPJS.";

const sageButton =
  "bg-[#14B8A6] text-white shadow-md shadow-teal-500/20 transition-all duration-300 hover:scale-105 hover:bg-teal-600 hover:shadow-lg hover:shadow-teal-500/25 focus-visible:ring-[#14B8A6] disabled:hover:scale-100 disabled:hover:bg-slate-300";
const clinicBackground =
  "relative overflow-hidden bg-[url('/bg-clinic.jpeg')] bg-cover bg-center";
const heroOverlay = "absolute inset-0 z-0 bg-white/90 backdrop-blur-sm";
const bentoOverlay = "absolute inset-0 z-0 bg-white/95 backdrop-blur-md";
const clinicContent = "relative z-10";
const bentoDepth =
  "shadow-lg shadow-teal-950/5 hover:shadow-[0_28px_70px_rgba(15,118,110,0.16)]";
const dismissedCancellationStorageKey = "trixsehat.dismissedCancellationIds";

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

function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function BotanicalLineArt({
  className,
  flipped = false,
}: {
  className?: string;
  flipped?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 520"
      className={cn(
        "pointer-events-none hidden h-[520px] w-[120px] text-teal-900/10 md:block",
        className,
      )}
      style={{ transform: flipped ? "scaleX(-1)" : undefined }}
      fill="none"
    >
      <path
        d="M62 510C58 438 58 372 66 304C73 245 83 192 72 132C66 96 57 60 60 14"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M64 376C41 357 28 334 25 304C54 312 70 334 64 376Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M70 308C94 291 107 267 107 238C79 248 64 270 70 308Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M70 221C45 205 31 182 30 151C59 160 75 183 70 221Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M70 142C94 126 106 102 103 74C78 84 63 107 70 142Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M58 456C36 444 23 425 20 398C47 405 62 425 58 456Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function prescriptionBadge(status: string) {
  if (status === "Siap diambil") return "success";
  if (status === "Diproses apotek") return "warning";
  return "secondary";
}

export default function PatientDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [bookingStatus, setBookingStatus] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [bookingTicket, setBookingTicket] = useState<BookingRecord | null>(null);
  const [emergencyTicket, setEmergencyTicket] = useState<EmergencyTicket>(null);
  const [emergencyWarning, setEmergencyWarning] = useState("");
  const [toast, setToast] = useState<AppToast>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [guestIdDaftar, setGuestIdDaftar] = useState("");
  const [dismissedCancellationIds, setDismissedCancellationIds] = useState<
    string[]
  >([]);
  const [authMode, setAuthMode] = useState<AuthMode>("masuk");
  const [authMessage, setAuthMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [emergencyStatus, setEmergencyStatus] = useState("");
  const [selectedClinic, setSelectedClinic] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [guestActiveBooking, setGuestActiveBooking] =
    useState<BookingRecord | null>(null);
  const session = useSession();
  const currentUser = session.data?.user;
  const userRole = (currentUser as { role?: string } | undefined)?.role;
  const isMember = Boolean(currentUser);
  const displayName = currentUser?.name ?? "Pengunjung TrixSehat";
  const userProfile = currentUser as
    | (typeof currentUser & {
        phoneNumber?: string | null;
        nik?: string | null;
        address?: string | null;
      })
    | undefined;

  useEffect(() => {
    if (session.isPending) return;
    if (userRole === "medis") router.replace("/medis");
    if (userRole === "admin") router.replace("/admin");
  }, [router, session.isPending, userRole]);

  useEffect(() => {
    const storedIds = window.localStorage.getItem(dismissedCancellationStorageKey);
    if (!storedIds) return;

    try {
      const parsedIds = JSON.parse(storedIds);
      if (Array.isArray(parsedIds)) {
        setDismissedCancellationIds(
          parsedIds.filter((item): item is string => typeof item === "string"),
        );
      }
    } catch {
      window.localStorage.removeItem(dismissedCancellationStorageKey);
    }
  }, []);

  useEffect(() => {
    const storedGuestId = window.localStorage.getItem("guest_id_daftar");
    if (storedGuestId) setGuestIdDaftar(storedGuestId);
  }, []);

  const { data: kamar, isLoading: kamarLoading } = useSWR<KamarApi>(
    "/api/kamar",
    fetcher,
    { refreshInterval: 30_000 },
  );
  const {
    data: resep,
    error: resepError,
    isLoading: resepLoading,
    mutate: mutateResep,
  } = useSWR<ResepApi>(
    isMember
      ? "/api/resep"
      : guestIdDaftar
        ? `/api/resep?id_daftar=${encodeURIComponent(guestIdDaftar)}`
        : null,
    fetcher,
    { refreshInterval: isMember || guestIdDaftar ? 5000 : 0 },
  );
  const {
    data: bookingData,
    mutate: mutateBooking,
    isLoading: bookingLoading,
  } = useSWR<BookingApi>(
    isMember
      ? "/api/booking"
      : guestIdDaftar
        ? `/api/booking?id_daftar=${encodeURIComponent(guestIdDaftar)}`
        : null,
    fetcher,
    { refreshInterval: isMember || guestIdDaftar ? 5000 : 0 },
  );
  const { data: billing, mutate: mutateBilling } = useSWR<BillingApi>(
    isMember
      ? "/api/billing"
      : guestIdDaftar
        ? `/api/billing?id_daftar=${encodeURIComponent(guestIdDaftar)}`
        : null,
    fetcher,
    { refreshInterval: isMember || guestIdDaftar ? 5000 : 0 },
  );
  const { data: notifications, mutate: mutateNotifications } =
    useSWR<NotifikasiApi>(
      isMember
        ? "/api/notifikasi"
        : guestIdDaftar
          ? `/api/notifikasi?id_daftar=${encodeURIComponent(guestIdDaftar)}`
          : null,
      fetcher,
      { refreshInterval: isMember || guestIdDaftar ? 5000 : 0 },
  );

  const doctorOptions = selectedClinic ? doctorsByClinic[selectedClinic] ?? [] : [];
  const isCompletedProfileValue = (value?: string | null) => {
    const normalized = value?.trim();
    return Boolean(normalized && normalized !== "Belum dilengkapi");
  };
  const bookingDefaultNik = isCompletedProfileValue(userProfile?.nik)
    ? userProfile!.nik!
    : "";
  const bookingDefaultName =
    isMember && isCompletedProfileValue(currentUser?.name)
      ? currentUser!.name
      : "";

  const patientRoomCards = useMemo(
    () =>
      (kamar?.data ?? [])
        .sort((left, right) => left.idKamar.localeCompare(right.idKamar)),
    [kamar],
  );
  const totalAvailableRooms = patientRoomCards.filter(
    (room) => room.status === "Tersedia",
  ).length;
  const totalPatientRooms = patientRoomCards.length;

  const prescriptionItems =
    resep?.data.flatMap((record) =>
      (record.resepObat ?? []).map((item) => ({
        ...item,
        status: record.statusResep,
        idRme: record.idRme,
      })),
    ) ?? [];

  const activeBooking = isMember
    ? bookingData?.active ?? null
    : bookingData?.active ?? guestActiveBooking;
  const bookingHistory = bookingData?.history ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const heroActiveBooking =
    activeBooking && ["MENUNGGU", "DIPANGGIL"].includes(activeBooking.status)
      ? activeBooking
      : null;
  const cancelledBookingNotice =
    bookingHistory.find(
      (item) =>
        item.status === "BATAL" &&
        item.tglKunjungan === today &&
        !dismissedCancellationIds.includes(item.id),
    ) ?? null;
  const hasMedicalHistory = Boolean(resep?.data.length);
  const medicineTotal = prescriptionItems.reduce(
    (sum, item) => sum + item.harga,
    0,
  );
  const invoiceRows =
    billing?.data.flatMap((item) => [
      ["Jasa dokter", item.biayaJasaDokter] as [string, number],
      ["Obat & vitamin", item.biayaObat] as [string, number],
    ]) ?? [];
  const invoiceTotal = invoiceRows.reduce((sum, [, price]) => sum + price, 0);
  const hasGuestScope = Boolean(guestIdDaftar);
  const canViewPersonalFinance = isMember || hasGuestScope;
  const hasActiveBooking = Boolean(activeBooking);
  const unreadNotifications = notifications?.unreadCount ?? 0;

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  function dismissCancellationNotice(id: string) {
    setDismissedCancellationIds((currentIds) => {
      const nextIds = Array.from(new Set([...currentIds, id]));
      window.localStorage.setItem(
        dismissedCancellationStorageKey,
        JSON.stringify(nextIds),
      );
      return nextIds;
    });
  }

  async function acknowledgeCancellationNotice(bookingId: string) {
    dismissCancellationNotice(bookingId);

    const response = await fetch("/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, status: "SELESAI" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutateBooking();
      return;
    }

    showToast("error", payload.message ?? "Gagal menutup pemberitahuan.");
  }

  async function closeNotifications() {
    setShowNotifications(false);

    if (!notifications?.data.length) return;

    await fetch("/api/notifikasi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestIdDaftar }),
    }).catch(() => null);
    await mutateNotifications();
  }

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasActiveBooking) return;

    setBookingStatus("Mengirim booking...");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nik: form.get("nik"),
        namaPasien: form.get("namaPasien"),
        tglKunjungan: form.get("tglKunjungan"),
        poliklinik: form.get("poliklinik"),
        dokter: form.get("dokter"),
        keluhan: form.get("keluhan"),
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      setBookingStatus("");
      if (isMember) {
        await mutateBooking();
      } else {
        window.localStorage.setItem("guest_id_daftar", payload.data.id);
        setGuestIdDaftar(payload.data.id);
        setGuestActiveBooking(payload.data);
      }
      await mutateNotifications();
      setBookingTicket(payload.data);
      return;
    }

    if (response.status === 409 && payload.data) {
      setBookingStatus(payload.message ?? "Antrean Anda Sedang Aktif");
      await mutateBooking();
      setActiveTab("janji-temu");
      return;
    }

    const message = payload.message ?? "Booking gagal.";
    setBookingStatus(message);
    showToast("error", message);
  }

  async function handleEmergencyCall() {
    setEmergencyStatus("Menghubungkan ambulans dan kamar VK...");

    const response = await fetch("/api/emergency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namaPasien: isMember ? displayName : "Pasien Darurat",
        nik: userProfile?.nik,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      setEmergencyStatus("");
      if (isMember) {
        await mutateBooking();
      } else {
        window.localStorage.setItem("guest_id_daftar", payload.data.booking.id);
        setGuestIdDaftar(payload.data.booking.id);
        setGuestActiveBooking(payload.data.booking);
      }
      await mutateNotifications();
      setEmergencyTicket(payload.data);
      return;
    }

    const message = payload.message ?? "Gagal mengaktifkan mode darurat.";
    setEmergencyStatus(message);
    if (response.status === 409) {
      setEmergencyWarning(message);
      return;
    }
    showToast("error", message);
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("Menyimpan data profil...");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phoneNumber: form.get("phoneNumber"),
        nik: form.get("nik"),
        address: form.get("address"),
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await session.refetch();
      setProfileMessage("Profil berhasil diperbarui.");
      showToast("success", "Profil berhasil diperbarui");
      setShowProfileModal(false);
      return;
    }

    const message = payload.message ?? "Profil gagal diperbarui.";
    setProfileMessage(message);
    showToast("error", message);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("Mengubah password...");

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      const message = "Konfirmasi password baru tidak sama.";
      setPasswordMessage(message);
      showToast("error", message);
      return;
    }

    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });

      if (result.error) {
        const message = result.error.message ?? "Password gagal diubah.";
        setPasswordMessage(message);
        showToast("error", message);
        return;
      }

      setPasswordMessage("Kata sandi berhasil diubah.");
      showToast("success", "Kata sandi berhasil diubah");
      setShowPasswordModal(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Password gagal diubah.";
      setPasswordMessage(message);
      showToast("error", message);
    }
  }

  async function handleCancelBooking() {
    if (!activeBooking) return;

    setBookingStatus("Membatalkan janji temu...");

    if (!isMember) {
      setGuestActiveBooking(null);
      setBookingStatus("Janji temu dibatalkan.");
      return;
    }

    const response = await fetch("/api/booking", { method: "PATCH" });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      await mutateBooking();
      setBookingStatus("Janji temu dibatalkan.");
      return;
    }

    setBookingStatus(payload.message ?? "Gagal membatalkan janji temu.");
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage(authMode === "masuk" ? "Memproses login..." : "Membuat akun...");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");
    const nik = String(form.get("nik") ?? "").replace(/\D/g, "").slice(0, 16);
    const phoneNumber = String(form.get("phoneNumber") ?? "").replace(/\D/g, "");

    if (authMode === "daftar" && (!nik || !phoneNumber)) {
      setAuthMessage("NIK dan nomor handphone wajib diisi dengan angka.");
      return;
    }

    try {
      const result =
        authMode === "masuk"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              email,
              password,
              name,
              nik,
              phoneNumber,
            } as Parameters<typeof authClient.signUp.email>[0] & {
              nik: string;
              phoneNumber: string;
            });

      if (result.error) {
        setAuthMessage(result.error.message ?? "Autentikasi gagal.");
        return;
      }

      await session.refetch();
      setAuthMessage("");
      setShowAuthModal(false);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Autentikasi gagal.");
    }
  }

  async function handleLogout() {
    await authClient.signOut();
    await session.refetch();
    setActiveTab("dashboard");
  }

  function openAuth(mode: AuthMode = "masuk") {
    setAuthMode(mode);
    setAuthMessage("");
    setShowAuthModal(true);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F8FAFC] text-slate-950">
      <div className="pointer-events-none absolute right-[-8rem] top-[-7rem] h-80 w-80 animate-pulse rounded-full bg-gradient-to-br from-[#14B8A6] to-[#99F6E4] opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-9rem] left-[-8rem] h-96 w-96 animate-pulse rounded-full bg-gradient-to-tr from-[#10B981] to-[#D1FAE5] opacity-20 blur-3xl [animation-delay:700ms]" />
      <BotanicalLineArt className="absolute left-2 top-36" />
      <BotanicalLineArt className="absolute right-2 top-64" flipped />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="sticky top-5 z-20 rounded-[2rem] border border-white/80 bg-white/80 px-5 py-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => setActiveTab("dashboard")}
              className="font-sans text-2xl font-bold tracking-normal text-[#4D5D4E]"
            >
              TrixSehat
            </button>

            <nav className="order-3 flex w-full items-center gap-5 overflow-x-auto text-sm font-semibold text-slate-700 md:order-2 md:w-auto md:gap-6 md:text-base">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "shrink-0 border-b-2 border-transparent py-2 transition-colors duration-300 hover:text-[#4D5D4E]",
                    activeTab === item.id && "border-[#4D5D4E] text-[#4D5D4E]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="order-2 flex items-center gap-3 md:order-3">
              <Button
                onClick={() => setActiveTab("booking")}
                className={cn("hidden rounded-full px-5 font-semibold sm:inline-flex", sageButton)}
              >
                Booking Antrean
              </Button>
              <div className="relative">
                <button
                  onClick={() => {
                    if (showNotifications) {
                      void closeNotifications();
                      return;
                    }
                    setShowNotifications(true);
                  }}
                  className="relative rounded-full p-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-[#4D5D4E]"
                  aria-label="Buka notifikasi"
                >
                  <Bell className="h-5 w-5" />
                  {unreadNotifications > 0 && (
                    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-white" />
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-3">
                      <p className="font-sans text-sm font-bold text-slate-900">
                        Notifikasi
                      </p>
                      <button
                        onClick={() => void closeNotifications()}
                        className="text-xs font-semibold text-[#0F766E]"
                      >
                        Tutup
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto py-2">
                      {(notifications?.data ?? []).length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-slate-500">
                          Belum ada notifikasi.
                        </p>
                      ) : (
                        notifications?.data.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              "rounded-xl px-3 py-3 text-sm leading-6",
                              item.isRead ? "text-slate-500" : "bg-teal-50 text-slate-800",
                            )}
                          >
                            <p className="font-medium">{item.pesan}</p>
                            <p className="mt-1 font-mono text-[11px] text-slate-400">
                              {formatDateTime(item.tglNotif)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isMember ? (
                <>
                  <button
                    onClick={() => setActiveTab("profil")}
                    className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[#E0F2F1] shadow-sm"
                    aria-label="Buka profil pasien"
                  >
                    <span className="font-serif text-lg font-semibold text-[#4D5D4E]">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </button>
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="rounded-full"
                  >
                    Keluar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => openAuth("masuk")}
                  className={cn("rounded-full px-5 font-semibold", sageButton)}
                >
                  Masuk / Daftar
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 py-10">
          {activeTab === "dashboard" && (
            <section className={pageClass}>
              {cancelledBookingNotice && (
                <div className="animate-card rounded-[1.5rem] border border-rose-200 bg-rose-100/80 p-5 text-rose-700 shadow-lg shadow-rose-200/40">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-sans text-lg font-bold">
                        PEMBERITAHUAN: Janji Temu Anda Hari Ini Telah
                        Dibatalkan oleh Dokter.
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        Alasan dari Dokter:{" "}
                        <span className="font-semibold">
                          {cancelledBookingNotice.alasanBatal ??
                            "Tidak ada alasan tertulis."}
                        </span>
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        acknowledgeCancellationNotice(cancelledBookingNotice.id)
                      }
                      className="rounded-full bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Mengerti
                    </Button>
                  </div>
                </div>
              )}
              <Card className={cn("animate-card rounded-[1.7rem] border-slate-200/80 shadow-[0_22px_55px_rgba(15,23,42,0.07)]", clinicBackground)}>
                <div className={heroOverlay} />
                <CardContent className={cn("p-8 md:p-10", clinicContent)}>
                  <div className="max-w-4xl">
                    <h1 className="font-sans text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">
                      Selamat pagi, {displayName}{" "}
                      <Sparkles className="inline h-8 w-8 text-[#06B6D4]" />
                    </h1>
                    <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-700">
                      {heroActiveBooking ? (
                        <>
                          Semoga sehat selalu. Anda memiliki jadwal{" "}
                          <span className="font-semibold text-slate-900">
                            {heroActiveBooking.poliklinik}
                          </span>{" "}
                          dengan{" "}
                          <span className="font-semibold text-slate-900">
                            {heroActiveBooking.dokter}
                          </span>{" "}
                          hari ini.
                        </>
                      ) : (
                        "Semoga sehat selalu. Anda tidak memiliki jadwal pemeriksaan aktif hari ini. Silakan gunakan menu 'Booking Antrean' di bawah untuk menjadwalkan konsultasi dengan dokter spesialis kami."
                      )}
                    </p>
                    {heroActiveBooking && (
                      <Button
                        onClick={() => setActiveTab("janji-temu")}
                        className={cn("mt-8 rounded-full px-7 text-base font-semibold", sageButton)}
                      >
                        Lihat Detail Janji Temu
                      </Button>
                    )}
                    {emergencyStatus && (
                      <p className="mt-5 text-sm font-medium text-rose-600">
                        {emergencyStatus}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-[2.1fr_1fr]">
                <Card
                  onClick={() => setActiveTab("booking")}
                  className={cn("bento-card animate-card cursor-pointer rounded-[1.7rem] border-slate-200/80", bentoDepth, clinicBackground)}
                  style={{ animationDelay: "80ms" }}
                >
                  <div className={bentoOverlay} />
                  <CardContent className={cn("grid min-h-60 items-center gap-8 p-8 md:grid-cols-[170px_1fr]", clinicContent)}>
                    <div className="rounded-2xl border bg-slate-50 p-3">
                      <div className="flex aspect-square items-center justify-center rounded-xl bg-[#E0F2F1]">
                        <div className="rounded-lg border-4 border-slate-800 bg-slate-700 p-2 shadow-inner">
                          <div className="flex min-h-32 min-w-32 flex-col items-center justify-center rounded-md bg-white p-3 text-center">
                            {heroActiveBooking ? (
                              <>
                                <p className="font-mono text-3xl font-bold text-[#0F766E]">
                                  {heroActiveBooking.nomorAntrean}
                                </p>
                                <p className="mt-2 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  Antrean Aktif
                                </p>
                              </>
                            ) : (
                              <>
                                <CalendarDays className="mx-auto h-9 w-9 text-slate-300" />
                                <p className="mt-3 font-mono text-2xl font-bold text-slate-300">
                                  A-000
                                </p>
                                <p className="mt-1 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  Belum Antre
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 className="font-sans text-2xl font-bold tracking-normal">
                        Booking Antrean Online
                      </h2>
                      <p className="mt-3 text-lg text-slate-700">
                        Daftar poli tanpa antre fisik.
                      </p>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveTab("booking");
                        }}
                        disabled={hasActiveBooking}
                        className={cn("mt-6 rounded-full px-6 text-base font-semibold disabled:bg-slate-300", sageButton)}
                      >
                        {hasActiveBooking
                          ? "Antrean Anda Sedang Aktif"
                          : "Pesan Sekarang"}{" "}
                        {!hasActiveBooking && <ChevronRight className="h-4 w-4" />}
                      </Button>
                      <div className="mt-7 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-700">
                            Estimasi Jadwal Terdekat
                          </p>
                          <Badge variant="secondary">Hari ini</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {[
                            ["Pagi", "09.00 - 12.00"],
                            ["Siang", "13.00 - 15.00"],
                            ["Sore", "16.00 - 18.00"],
                          ].map(([label, time]) => (
                            <div
                              key={label}
                              className="rounded-xl border border-slate-200 bg-white/70 px-3 py-3"
                            >
                              <p className="text-xs font-medium text-slate-500">
                                {label}
                              </p>
                              <p className="mt-1 font-mono text-sm font-semibold text-[#4D5D4E]">
                                {time}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4">
                        <p className="text-sm font-semibold text-slate-700">
                          Panduan Alur Pasien Online (OTW)
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          {[
                            ["1", "Booking Online dari Rumah"],
                            ["2", "OTW menuju Rumah Sakit Kartini"],
                            [
                              "3",
                              "Scan QR / Mandiri Check-In saat tiba di RS untuk masuk antrean poli",
                            ],
                          ].map(([step, label]) => (
                            <div
                              key={step}
                              className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white font-mono text-xs font-bold text-[#4D5D4E]">
                                {step}
                              </div>
                              <p className="text-sm leading-5 text-slate-700">
                                {label}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6">
                  <Card
                    onClick={() => setActiveTab("kesehatan-ibu")}
                    className={cn("bento-card animate-card cursor-pointer rounded-[1.7rem] border-slate-200/80", bentoDepth, clinicBackground)}
                    style={{ animationDelay: "160ms" }}
                  >
                    <div className={bentoOverlay} />
                    <CardContent className={cn("p-7", clinicContent)}>
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-slate-50 text-[#06B6D4]">
                          <BedDouble className="h-6 w-6" />
                        </div>
                        <div>
                          <h2 className="font-sans text-2xl font-bold tracking-normal">
                            Live Ward Tracker
                          </h2>
                          <p className="mt-4 text-slate-700">
                            {kamarLoading
                              ? "Memuat kamar real-time..."
                              : "Ketersediaan kamar real-time"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-6 flex items-center justify-between rounded-lg border bg-slate-50 px-4 py-3">
                        <span>Sisa Kamar Kosong</span>
                        <Badge className="border-[#D9E4D6] bg-[#EEF4EA] font-mono text-[#4D5D4E]">
                          {totalAvailableRooms}/{totalPatientRooms || 0}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    onClick={() => setActiveTab("riwayat")}
                    className={cn("bento-card animate-card cursor-pointer rounded-[1.7rem] border-slate-200/80", bentoDepth, clinicBackground)}
                    style={{ animationDelay: "240ms" }}
                  >
                    <div className={bentoOverlay} />
                    <CardContent className={cn("p-7", clinicContent)}>
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-slate-50 text-[#4D5D4E]">
                          <ReceiptText className="h-6 w-6" />
                        </div>
                        <h2 className="font-sans text-2xl font-bold tracking-normal">
                          Resep & Tagihan
                        </h2>
                      </div>
                      <p className="mt-6 text-slate-700">
                        {canViewPersonalFinance
                          ? invoiceTotal > 0
                            ? "Tagihan tertunda untuk kunjungan terakhir."
                            : "Tidak ada tagihan tertunda."
                          : "Masuk untuk melihat resep dan tagihan personal."}
                      </p>
                      <p className="mt-3 font-mono text-3xl font-bold">
                        {canViewPersonalFinance
                          ? formatCurrency(invoiceTotal)
                          : "Terkunci"}
                      </p>
                      <div className="mt-6 flex items-center justify-between rounded-lg border bg-slate-50 px-4 py-3">
                        <span className="font-mono">
                          {canViewPersonalFinance
                            ? prescriptionItems.length > 0
                              ? `${prescriptionItems.length} Resep siap dipantau`
                              : "Tidak ada resep aktif"
                            : "Login diperlukan"}
                        </span>
                        <span className="font-semibold text-[#4D5D4E]">
                          Lihat Detail
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </section>
          )}

          {activeTab === "janji-temu" && (
            <section className={pageClass}>
              <Card className="rounded-[1.7rem] bg-white">
                <CardHeader>
                  <CardTitle className="font-sans text-2xl font-bold">
                    Janji Temu Hari Ini
                  </CardTitle>
                  <CardDescription>
                    Status antrean dan detail pemeriksaan pasien.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bookingLoading ? (
                    <p className="text-sm text-slate-600">Memuat janji temu...</p>
                  ) : activeBooking ? (
                    <div className="space-y-5">
                      <div className="grid gap-5 md:grid-cols-4">
                        {[
                          ["Nomor antrean", activeBooking.nomorAntrean],
                          ["Estimasi dilayani", "09:40"],
                          ["Lokasi", activeBooking.poliklinik],
                          ["Status", activeBooking.status],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-2xl border bg-slate-50 p-5"
                          >
                            <p className="text-sm text-slate-500">{label}</p>
                            <p className="mt-2 font-mono text-2xl font-bold text-slate-950">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-2xl border bg-slate-50 p-5">
                        <p className="text-sm text-slate-500">Dokter spesialis</p>
                        <p className="mt-2 font-semibold text-slate-950">
                          {activeBooking.dokter}
                        </p>
                        {activeBooking.keluhan && (
                          <p className="mt-2 text-sm text-slate-600">
                            Keluhan: {activeBooking.keluhan}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={handleCancelBooking}
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50"
                      >
                        Batalkan Janji Temu
                      </Button>
                      {bookingStatus && (
                        <p className="text-sm font-medium text-slate-700">
                          {bookingStatus}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
                      <CalendarDays className="mx-auto h-10 w-10 text-[#4D5D4E]" />
                      <p className="mt-4 font-sans text-xl font-bold">
                        Anda belum memiliki janji temu aktif hari ini.
                      </p>
                      <Button
                        onClick={() => setActiveTab("booking")}
                        className={cn("mt-5 rounded-full px-7", sageButton)}
                      >
                        Booking Antrean
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "booking" && (
            <section className={pageClass}>
              <Card className="rounded-[1.7rem] bg-white">
                <CardHeader>
                  <CardTitle className="font-sans text-2xl font-bold">
                    Booking Antrean
                  </CardTitle>
                  <CardDescription>
                    Guest tetap dapat booking antrean. Login menyimpan booking
                    ke akun pasien Anda.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hasActiveBooking && (
                    <div className="mb-5 rounded-2xl border border-[#99F6E4] bg-[#F0FDFA] p-4 text-sm text-slate-700">
                      <span className="font-semibold text-[#4D5D4E]">
                        Antrean Anda Sedang Aktif:
                      </span>{" "}
                      {activeBooking?.nomorAntrean} ({activeBooking?.status}).
                      Batalkan janji temu sebelumnya untuk membuat booking baru.
                    </div>
                  )}
                  <form
                    onSubmit={handleBookingSubmit}
                    className="grid gap-4 md:grid-cols-3"
                  >
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        NIK
                      </span>
                      <input
                        key={`booking-nik-${bookingDefaultNik}`}
                        name="nik"
                        defaultValue={bookingDefaultNik}
                        placeholder="16 digit NIK"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#4D5D4E] focus:ring-2"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Nama Pasien
                      </span>
                      <input
                        key={`booking-name-${bookingDefaultName}`}
                        name="namaPasien"
                        defaultValue={bookingDefaultName}
                        placeholder="Nama lengkap pasien"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#4D5D4E] focus:ring-2"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Tanggal Kunjungan
                      </span>
                      <input
                        name="tglKunjungan"
                        type="date"
                        defaultValue="2026-06-10"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 font-mono outline-none ring-[#4D5D4E] focus:ring-2"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Pilih Poliklinik
                      </span>
                      <select
                        name="poliklinik"
                        required
                        value={selectedClinic}
                        onChange={(event) => {
                          setSelectedClinic(event.target.value);
                          setSelectedDoctor("");
                        }}
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
                      >
                        <option value="" disabled>
                          -- Pilih Poliklinik --
                        </option>
                        {clinicOptions.map((clinic) => (
                          <option key={clinic} value={clinic}>
                            {clinic}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Pilih Dokter Spesialis
                      </span>
                      <select
                        name="dokter"
                        required
                        value={selectedDoctor}
                        onChange={(event) => setSelectedDoctor(event.target.value)}
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
                      >
                        <option value="" disabled>
                          -- Pilih Dokter --
                        </option>
                        {doctorOptions.map((doctor) => (
                          <option key={doctor} value={doctor}>
                            {doctor}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">
                        Keluhan Singkat
                      </span>
                      <input
                        name="keluhan"
                        placeholder="Contoh: kontrol rutin / demam anak"
                        className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
                      />
                    </label>
                    <div className="md:col-span-3">
                      <Button
                        disabled={hasActiveBooking}
                        className={cn("rounded-full px-7 disabled:bg-slate-300", sageButton)}
                      >
                        {hasActiveBooking
                          ? "Antrean Anda Sedang Aktif"
                          : "Pesan Sekarang"}
                      </Button>
                      {hasActiveBooking && (
                        <Button
                          type="button"
                          onClick={handleCancelBooking}
                          variant="outline"
                          className="ml-3 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          Batalkan Janji Temu
                        </Button>
                      )}
                      {bookingStatus && (
                        <p className="mt-3 text-sm font-medium text-slate-700">
                          {bookingStatus}
                        </p>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "riwayat" && (
            <section className={pageClass}>
              {isMember || hasGuestScope ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <Card className="rounded-[1.7rem] bg-white">
                    <CardHeader>
                      <CardTitle className="font-sans font-bold">
                        Resep Saya
                      </CardTitle>
                      <CardDescription>
                        Data diambil dari tabel rekam_medis_elektronik.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {resepLoading && <p className="text-sm">Memuat resep...</p>}
                      {resepError && (
                        <p className="text-sm text-rose-600">
                          {resepError.message}
                        </p>
                      )}
                      {!resepLoading && prescriptionItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-slate-600">
                          Anda belum memiliki resep aktif saat ini.
                        </div>
                      ) : (
                        prescriptionItems.map((item) => (
                          <div
                            key={`${item.idRme}-${item.nama}`}
                            className="space-y-2 border-b pb-4 last:border-0 last:pb-0"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{item.nama}</p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {item.dosis}
                                </p>
                              </div>
                              <p className="font-mono font-bold">
                                {formatCurrency(item.harga)}
                              </p>
                            </div>
                            <Badge variant={prescriptionBadge(item.status)}>
                              {item.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[1.7rem] bg-white">
                    <CardHeader>
                      <CardTitle className="font-sans font-bold">
                        Kuitansi
                      </CardTitle>
                      <CardDescription>
                        Total sementara kunjungan hari ini.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {invoiceRows.length > 0 ? (
                        invoiceRows.map(([label, price]) => (
                          <div key={label} className="flex justify-between gap-3 text-sm">
                            <span className="text-slate-600">{label}</span>
                            <span className="font-mono font-semibold">
                              {formatCurrency(price)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-slate-600">
                          Tidak ada tagihan tertunda.
                        </p>
                      )}
                      <div className="rounded-2xl border bg-[#E0F2F1] p-5 text-[#4D5D4E]">
                        <p className="text-sm font-semibold">Total sementara</p>
                        <p className="mt-1 font-mono text-3xl font-bold">
                          {formatCurrency(invoiceTotal)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-[1.7rem] bg-white lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="font-sans font-bold">
                        Riwayat Kunjungan
                      </CardTitle>
                      <CardDescription>
                        Catatan pemeriksaan yang sudah tercatat pada RME.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!hasMedicalHistory ? (
                        <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-slate-600">
                          Belum ada riwayat pemeriksaan.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {resep?.data.map((record) => (
                            <div
                              key={record.idRme}
                              className="rounded-2xl border bg-slate-50 p-5"
                            >
                              <p className="font-semibold">
                                {record.keluhanUtama}
                              </p>
                              <p className="mt-2 text-sm text-slate-600">
                                {record.diagnosaIcd10} • {record.tindakanMedis}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <ProtectedFeature onOpenAuth={() => openAuth("masuk")}>
                  {lockedMessage}
                </ProtectedFeature>
              )}
            </section>
          )}

          {activeTab === "kesehatan-ibu" && (
            <section className={pageClass}>
              <Card className="rounded-[1.7rem] bg-white">
                <CardHeader>
                  <CardTitle className="font-sans font-bold">
                    Status Kamar RSU TrixSehat
                  </CardTitle>
                  <CardDescription>
                    Informasi ketersediaan kamar bersalin (VK) dan ruang rawat
                    inap RSU TrixSehat secara real-time untuk kenyamanan
                    pelayanan Anda.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {kamarLoading ? (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                      Memuat status kamar...
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {patientRoomCards.map((room) => (
                        <div
                          key={room.idKamar}
                          className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate font-sans text-lg font-bold text-slate-950">
                                {room.idKamar}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-400">
                                {room.jenisKamar}
                              </p>
                            </div>
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white text-[#06B6D4]">
                              <BedDouble className="h-5 w-5" />
                            </div>
                          </div>
                          <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
                            <span className="text-xs font-medium text-slate-500">
                              Status saat ini
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-3 py-1 font-mono text-[11px]",
                                roomStatusBadgeClass[room.status],
                              )}
                            >
                              {room.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "kesehatan-anak" && (
            <section className={pageClass}>
              {isMember ? (
                <Card className="rounded-[1.7rem] bg-white">
                  <CardHeader>
                    <CardTitle className="font-sans font-bold">
                      Kesehatan Anak
                    </CardTitle>
                    <CardDescription>
                      Ringkasan persiapan kelahiran dan pemantauan awal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!hasMedicalHistory ? (
                      <PregnancyEmptyState />
                    ) : (
                      <div className="grid gap-5 md:grid-cols-3">
                        {[
                          [Baby, "Trimester", "Minggu 32 dari 40"],
                          [HeartPulse, "Detak janin", "Normal"],
                          [ClipboardList, "Checklist", "80% lengkap"],
                        ].map(([Icon, label, value]) => (
                          <div
                            key={label as string}
                            className="rounded-2xl border bg-slate-50 p-5"
                          >
                            <Icon className="h-6 w-6 text-[#4D5D4E]" />
                            <p className="mt-4 text-sm text-slate-500">
                              {label as string}
                            </p>
                            <p className="mt-1 font-semibold">{value as string}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <ProtectedFeature onOpenAuth={() => openAuth("masuk")}>
                  {lockedMessage}
                </ProtectedFeature>
              )}
            </section>
          )}

          {activeTab === "profil" && (
            <section className={pageClass}>
              {isMember ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <Card className={cn("rounded-[1.7rem] border-slate-200/80 shadow-[0_18px_45px_rgba(15,23,42,0.06)]", clinicBackground)}>
                    <div className={bentoOverlay} />
                    <CardHeader className={clinicContent}>
                      <CardTitle className="font-sans text-2xl font-bold">
                        Profil Pasien
                      </CardTitle>
                      <CardDescription>
                        Detail akun pasien yang tersinkron dengan session Better Auth.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className={cn("space-y-4", clinicContent)}>
                      {[
                        [UserRound, "Nama Lengkap", displayName],
                        [Mail, "Email", currentUser?.email ?? "-"],
                        [Phone, "Nomor Handphone", userProfile?.phoneNumber ?? "Belum dilengkapi"],
                        [IdCard, "NIK", userProfile?.nik ?? activeBooking?.nik ?? "Belum dilengkapi"],
                        [MapPin, "Alamat Rumah", userProfile?.address ?? "Belum dilengkapi"],
                      ].map(([Icon, label, value]) => (
                        <div
                          key={label as string}
                          className="flex items-center gap-4 rounded-2xl border bg-white/75 p-4"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF4EA] text-[#4D5D4E]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-slate-500">
                              {label as string}
                            </p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {value as string}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[1.7rem] bg-white">
                    <CardHeader>
                      <CardTitle className="font-sans font-bold">
                        Pengaturan Akun
                      </CardTitle>
                      <CardDescription>
                        Simulasi aksi lanjutan untuk pengelolaan akun pasien.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button
                        onClick={() => {
                          setProfileMessage("");
                          setShowProfileModal(true);
                        }}
                        className={cn("w-full justify-start rounded-2xl px-5", sageButton)}
                      >
                        <Pencil className="h-4 w-4" />
                        Ubah Data Profil
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPasswordMessage("");
                          setShowPasswordModal(true);
                        }}
                        className="w-full justify-start rounded-2xl px-5"
                      >
                        <KeyRound className="h-4 w-4" />
                        Keamanan Akun (Ganti Password)
                      </Button>
                      <div className="rounded-2xl border bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                        Data NIK, nomor handphone, dan alamat kini tersimpan ke
                        database pasien dan akan muncul kembali setelah profil
                        diperbarui.
                      </div>
                      {profileMessage && (
                        <p className="text-sm font-medium text-slate-600">
                          {profileMessage}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <ProtectedFeature onOpenAuth={() => openAuth("masuk")}>
                  Silakan masuk atau daftar akun TrixSehat terlebih dahulu untuk
                  melihat dan mengelola profil pasien.
                </ProtectedFeature>
              )}
            </section>
          )}
        </div>

        <footer className="mt-auto border-t border-slate-200 py-8">
          <div className="flex flex-col gap-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <p className="font-sans text-xl font-bold text-slate-950">TrixSehat</p>
            <div className="flex gap-6">
              <span>Kebijakan Privasi</span>
              <span>Bantuan</span>
              <span>Kontak Darurat</span>
            </div>
            <p className="font-mono text-xs text-slate-400">
              © 2026 TrixSehat Maternal & Child Health.
            </p>
          </div>
        </footer>
      </div>

      <button
        onClick={handleEmergencyCall}
        className="emergency-glow fixed bottom-7 right-7 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-[#E11D48] text-white shadow-2xl"
        aria-label="Panggil ambulans darurat"
      >
        <ShieldAlert className="h-8 w-8" />
      </button>

      {showAuthModal && (
        <AuthModal
          authMode={authMode}
          authMessage={authMessage}
          onAuthModeChange={(mode) => {
            setAuthMode(mode);
            setAuthMessage("");
          }}
          onClose={() => setShowAuthModal(false)}
          onSubmit={handleAuthSubmit}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          defaultName={displayName}
          defaultPhoneNumber={userProfile?.phoneNumber ?? ""}
          defaultNik={userProfile?.nik ?? activeBooking?.nik ?? ""}
          defaultAddress={userProfile?.address ?? ""}
          message={profileMessage}
          onClose={() => setShowProfileModal(false)}
          onSubmit={handleProfileSubmit}
        />
      )}

      {showPasswordModal && (
        <PasswordModal
          message={passwordMessage}
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handlePasswordSubmit}
        />
      )}

      {bookingTicket && (
        <BookingTicketModal
          ticket={bookingTicket}
          onClose={() => {
            setBookingTicket(null);
            setActiveTab("janji-temu");
          }}
        />
      )}

      {emergencyTicket && (
        <EmergencyFlowModal
          ticket={emergencyTicket}
          onClose={() => {
            setEmergencyTicket(null);
            setActiveTab("janji-temu");
          }}
        />
      )}

      {emergencyWarning && (
        <EmergencyWardFullModal
          message={emergencyWarning}
          onClose={() => setEmergencyWarning("")}
        />
      )}

      {toast && <AppToast toast={toast} />}
    </main>
  );
}

function ProtectedFeature({
  children,
  onOpenAuth,
}: {
  children: ReactNode;
  onOpenAuth: () => void;
}) {
  return (
    <Card className="relative overflow-hidden rounded-[1.7rem] border-slate-200/80 bg-white">
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[2px]" />
      <CardContent className="relative p-8 md:p-10">
        <div className="mx-auto max-w-2xl rounded-[1.5rem] border border-[#99F6E4] bg-[#F0FDFA] p-7 text-center shadow-[0_20px_50px_rgba(15,118,110,0.09)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#4D5D4E]">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="mt-5 font-sans text-2xl font-bold text-slate-950">
            Fitur Terkunci
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">{children}</p>
          <Button
            onClick={onOpenAuth}
            className={cn("mt-6 rounded-full px-7", sageButton)}
          >
            Masuk / Daftar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AppToast({ toast }: { toast: NonNullable<AppToast> }) {
  const isSuccess = toast.type === "success";
  const Icon = isSuccess ? CheckCircle2 : XCircle;

  return (
    <div className="fixed right-5 top-5 z-[60] animate-card">
      <div className="flex min-w-72 max-w-sm items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-xl">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            isSuccess
              ? "bg-emerald-50 text-emerald-600"
              : "bg-rose-50 text-rose-600",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <p className="pt-1 text-sm font-semibold leading-6 text-slate-800">
          {toast.message}
        </p>
      </div>
    </div>
  );
}

function BookingTicketModal({
  ticket,
  onClose,
}: {
  ticket: BookingRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <Card className="animate-card w-full max-w-lg rounded-2xl border-[#E2E8F0] bg-white shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <CardTitle className="font-sans text-2xl font-bold">
            Pendaftaran Berhasil!
          </CardTitle>
          <CardDescription>
            Tiket antrean digital Anda sudah tersimpan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              Nomor Antrean
            </p>
            <p className="mt-2 font-mono text-5xl font-bold text-[#0F766E]">
              {ticket.nomorAntrean}
            </p>
          </div>
          <div className="grid gap-3 text-sm">
            {[
              ["Dokter spesialis", ticket.dokter],
              ["Estimasi pelayanan", "09:40 WIB"],
              ["Lokasi poli", ticket.poliklinik],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-start justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-slate-50 px-4 py-3"
              >
                <span className="text-slate-500">{label}</span>
                <span className="text-right font-semibold text-slate-900">
                  {value}
                </span>
              </div>
            ))}
          </div>
          <Button
            onClick={onClose}
            className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
          >
            Tutup & Lihat Janji Temu
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmergencyFlowModal({
  ticket,
  onClose,
}: {
  ticket: NonNullable<EmergencyTicket>;
  onClose: () => void;
}) {
  const steps = ["Menghubungi Armada", "Kamar Rawat Dikunci", "Ambulans OTW"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <Card className="animate-card w-full max-w-xl rounded-2xl border-[#E2E8F0] bg-white shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="emergency-glow flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Siren className="h-9 w-9" />
          </div>
          <CardTitle className="font-sans text-2xl font-bold text-rose-600">
            Darurat Kebidanan Aktif!
          </CardTitle>
          <CardDescription>
            Nomor respons darurat{" "}
            <span className="font-mono font-bold text-slate-900">
              {ticket.booking.nomorAntrean}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-5 text-sm leading-7 text-slate-700">
            Ambulans TrixSehat sedang menuju lokasi Anda. 1 kamar rawat
            telah otomatis dicadangkan (reserved) untuk keselamatan Anda.
            <span className="mt-2 block font-semibold text-rose-700">
              Kamar dicadangkan: {ticket.assignedRoom}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-[#E2E8F0] bg-slate-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F766E] font-mono text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  {step}
                </p>
              </div>
            ))}
          </div>
          <Button
            onClick={onClose}
            className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
          >
            Tutup & Lihat Janji Temu
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmergencyWardFullModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <Card className="animate-card w-full max-w-xl rounded-2xl border-[#E2E8F0] bg-white shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="h-9 w-9" />
          </div>
          <CardTitle className="font-sans text-2xl font-bold text-rose-600">
            Kamar Bersalin Penuh
          </CardTitle>
          <CardDescription>
            Sistem tidak membuat booking darurat otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-5 text-sm leading-7 text-slate-700">
            {message}
          </div>
          <Button
            onClick={onClose}
            className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
          >
            Mengerti
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PregnancyEmptyState() {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[#D9E4D6] bg-[#F7F9F5] p-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF4EA] text-[#4D5D4E]">
          <Baby className="h-7 w-7" />
        </div>
      </div>
      <h2 className="mt-5 font-sans text-xl font-bold text-slate-950">
        Belum ada catatan pemantauan kehamilan aktif.
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        Data perkembangan kehamilan dan tumbuh kembang anak akan otomatis
        ter-update di sini setelah Anda melakukan pemeriksaan di Poliklinik
        Kebidanan & Kandungan TrixSehat.
      </p>
    </div>
  );
}

function AuthModal({
  authMode,
  authMessage,
  onAuthModeChange,
  onClose,
  onSubmit,
}: {
  authMode: AuthMode;
  authMessage: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-md rounded-[1.7rem] border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="font-sans text-2xl font-bold">
              {authMode === "masuk" ? "Masuk Akun" : "Daftar Akun Baru"}
            </CardTitle>
            <CardDescription>
              Akses resep, RME, klaim BPJS, dan riwayat pasien.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-2 rounded-full bg-slate-100 p-1">
            {[
              ["masuk", "Masuk"],
              ["daftar", "Daftar"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onAuthModeChange(mode as AuthMode)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  authMode === mode
                    ? "bg-white text-[#4D5D4E] shadow-sm"
                    : "text-slate-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {authMode === "daftar" && (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Nama</span>
                  <input
                    name="name"
                    required
                    placeholder="Nadia Putri"
                    className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#4D5D4E] focus:ring-2"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">NIK</span>
                  <input
                    name="nik"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{1,16}"
                    maxLength={16}
                    placeholder="16 digit NIK"
                    onInput={(event) => {
                      event.currentTarget.value = event.currentTarget.value
                        .replace(/\D/g, "")
                        .slice(0, 16);
                    }}
                    className="h-11 w-full rounded-xl border bg-slate-50 px-3 font-mono outline-none ring-[#4D5D4E] focus:ring-2"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">
                    Nomor Handphone
                  </span>
                  <input
                    name="phoneNumber"
                    required
                    inputMode="numeric"
                    pattern="[0-9]+"
                    placeholder="08xxxxxxxxxx"
                    onInput={(event) => {
                      event.currentTarget.value =
                        event.currentTarget.value.replace(/\D/g, "");
                    }}
                    className="h-11 w-full rounded-xl border bg-slate-50 px-3 font-mono outline-none ring-[#4D5D4E] focus:ring-2"
                  />
                </label>
              </>
            )}
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="nama@email.com"
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#4D5D4E] focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Minimal 8 karakter"
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#4D5D4E] focus:ring-2"
              />
            </label>
            <Button className={cn("w-full rounded-full", sageButton)}>
              {authMode === "masuk" ? "Masuk" : "Daftar Akun"}
            </Button>
            {authMessage && (
              <p className="text-center text-sm font-medium text-slate-600">
                {authMessage}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileModal({
  defaultName,
  defaultPhoneNumber,
  defaultNik,
  defaultAddress,
  message,
  onClose,
  onSubmit,
}: {
  defaultName: string;
  defaultPhoneNumber: string;
  defaultNik: string;
  defaultAddress: string;
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg rounded-[1.7rem] border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="font-sans text-2xl font-bold">
              Ubah Data Profil
            </CardTitle>
            <CardDescription>
              Lengkapi data pasien untuk administrasi antrean dan klaim.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Nama Lengkap
              </span>
              <input
                name="name"
                required
                defaultValue={defaultName}
                placeholder="Nama lengkap pasien"
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Nomor Handphone
              </span>
              <input
                name="phoneNumber"
                required
                defaultValue={defaultPhoneNumber}
                inputMode="numeric"
                pattern="[0-9]+"
                placeholder="08xxxxxxxxxx"
                onInput={(event) => {
                  event.currentTarget.value =
                    event.currentTarget.value.replace(/\D/g, "");
                }}
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 font-mono outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">NIK</span>
              <input
                name="nik"
                required
                defaultValue={defaultNik}
                inputMode="numeric"
                pattern="[0-9]{1,16}"
                maxLength={16}
                placeholder="Nomor Induk Kependudukan"
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value
                    .replace(/\D/g, "")
                    .slice(0, 16);
                }}
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 font-mono outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Alamat Rumah
              </span>
              <textarea
                name="address"
                required
                defaultValue={defaultAddress}
                rows={3}
                placeholder="Alamat lengkap pasien"
                className="w-full rounded-xl border bg-slate-50 px-3 py-3 outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            {message && (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-600">
                {message}
              </p>
            )}
            <Button className={cn("w-full rounded-full", sageButton)}>
              Simpan Data Profil
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordModal({
  message,
  onClose,
  onSubmit,
}: {
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-md rounded-[1.7rem] border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="font-sans text-2xl font-bold">
              Keamanan Akun
            </CardTitle>
            <CardDescription>
              Ganti password akun pasien TrixSehat Anda.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Password Saat Ini
              </span>
              <input
                name="currentPassword"
                type="password"
                required
                minLength={8}
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Password Baru
              </span>
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                Konfirmasi Password Baru
              </span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 outline-none ring-[#14B8A6] focus:ring-2"
              />
            </label>
            {message && (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-600">
                {message}
              </p>
            )}
            <Button className={cn("w-full rounded-full", sageButton)}>
              Simpan Password Baru
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
