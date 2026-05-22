import { randomUUID } from "node:crypto";
import type { Outlet } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const AUTO_OUTLET_CODE_PREFIX = "AUTO";
const OUTLET_REUSE_RADIUS_METERS = 75;

export class OutletResolutionError extends Error {
  status = 400;
}

export type OutletResolution = {
  outlet: Outlet;
  created: boolean;
  matchedBy: "id" | "nearby_name" | "created";
};

export async function resolveOutletForVisit({
  outletId,
  outletName,
  checkInLat,
  checkInLng,
}: {
  outletId?: unknown;
  outletName?: unknown;
  checkInLat?: unknown;
  checkInLng?: unknown;
}): Promise<OutletResolution> {
  const explicitOutletId = stringOrNull(outletId);
  if (explicitOutletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: explicitOutletId } });
    if (!outlet) {
      throw new OutletResolutionError("Selected outlet was not found.");
    }
    return { outlet, created: false, matchedBy: "id" };
  }

  const name = parseOutletName(outletName);
  const lat = numberOrNull(checkInLat);
  const lng = numberOrNull(checkInLng);
  const normalizedName = normalizeOutletName(name);
  const nearbyOutlet = await findNearbyOutlet({ name, normalizedName, lat, lng });

  if (nearbyOutlet) {
    return { outlet: nearbyOutlet, created: false, matchedBy: "nearby_name" };
  }

  const outlet = await prisma.outlet.create({
    data: {
      name,
      normalizedName,
      code: await generateAutoOutletCode(),
      latitude: lat,
      longitude: lng,
      verificationStatus: "UNVERIFIED",
    },
  });

  return { outlet, created: true, matchedBy: "created" };
}

export function normalizeOutletName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseOutletName(value: unknown): string {
  if (typeof value !== "string") {
    throw new OutletResolutionError("Shop name is required.");
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new OutletResolutionError("Shop name must be at least 2 characters.");
  }

  if (name.length > 120) {
    throw new OutletResolutionError("Shop name must be 120 characters or less.");
  }

  return name;
}

async function findNearbyOutlet({
  name,
  normalizedName,
  lat,
  lng,
}: {
  name: string;
  normalizedName: string;
  lat: number | null;
  lng: number | null;
}): Promise<Outlet | null> {
  if (lat === null || lng === null) return null;

  const candidates = await prisma.outlet.findMany({
    where: {
      OR: [{ normalizedName }, { name: { equals: name, mode: "insensitive" } }],
    },
    take: 25,
  });

  const ranked = candidates
    .map((outlet) => {
      if (outlet.latitude === null || outlet.longitude === null) return null;
      return {
        outlet,
        distanceMeters: haversineMeters(lat, lng, outlet.latitude, outlet.longitude),
      };
    })
    .filter((candidate): candidate is { outlet: Outlet; distanceMeters: number } => Boolean(candidate))
    .filter((candidate) => candidate.distanceMeters <= OUTLET_REUSE_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return ranked[0]?.outlet ?? null;
}

async function generateAutoOutletCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `${AUTO_OUTLET_CODE_PREFIX}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const existing = await prisma.outlet.findUnique({ where: { code } });
    if (!existing) return code;
  }

  throw new OutletResolutionError("Could not generate a unique outlet code.");
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
