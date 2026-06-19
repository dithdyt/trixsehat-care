import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BPJS_VALIDITY_DAYS = 90;

// BPJS (simulasi) dianggap aktif selama flag-nya true DAN belum lewat masa
// berlaku 90 hari sejak verifikasi terakhir.
export function isBpjsActive(
  bpjsActive: boolean | null | undefined,
  bpjsVerifiedAt: string | number | Date | null | undefined,
) {
  if (!bpjsActive || !bpjsVerifiedAt) return false;
  return bpjsDaysRemaining(bpjsVerifiedAt) > 0;
}

export function bpjsDaysRemaining(
  bpjsVerifiedAt: string | number | Date | null | undefined,
) {
  if (!bpjsVerifiedAt) return 0;
  const elapsedMs = Date.now() - new Date(bpjsVerifiedAt).getTime();
  const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  return Math.max(BPJS_VALIDITY_DAYS - elapsedDays, 0);
}
