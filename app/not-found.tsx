import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-slate-950">
      <Card className="w-full max-w-md rounded-[1.7rem] border-slate-200/80 bg-white shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E0F2F1] text-[#0F766E]">
            <CalendarDays className="h-9 w-9" />
          </div>
          <CardTitle className="font-sans text-2xl font-bold">
            Halaman Tidak Ditemukan
          </CardTitle>
          <CardDescription>
            Halaman yang Anda cari tidak ada atau sudah dipindahkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700">
            <Link href="/">Kembali ke Beranda</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
