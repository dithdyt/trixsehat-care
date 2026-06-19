"use client";

import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-slate-950">
      <Card className="w-full max-w-md rounded-[1.7rem] border-slate-200/80 bg-white shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="h-9 w-9" />
          </div>
          <CardTitle className="font-sans text-2xl font-bold text-rose-600">
            Terjadi Kesalahan
          </CardTitle>
          <CardDescription>
            Sistem TrixSehat mengalami gangguan sementara. Silakan coba lagi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={reset}
            className="w-full rounded-full bg-[#0F766E] text-white hover:bg-teal-700"
          >
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
