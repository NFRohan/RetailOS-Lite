import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export async function hashFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function complianceColor(status: string) {
  switch (status) {
    case "excellent":
      return "text-emerald-500";
    case "acceptable":
      return "text-emerald-400";
    case "poor":
      return "text-amber-500";
    case "critical":
      return "text-rose-500";
    default:
      return "text-muted-foreground";
  }
}

export function complianceBg(status: string) {
  switch (status) {
    case "excellent":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "acceptable":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "poor":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "critical":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}
