import { Prisma, type OutletVerificationStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeOutletName, numberOrNull } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const editableStatuses = ["VERIFIED", "UNVERIFIED", "REJECTED"] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const verificationStatus = parseOutletStatus(body.verificationStatus);
  if (!verificationStatus) {
    return NextResponse.json({ error: "Valid verificationStatus is required." }, { status: 400 });
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().replace(/\s+/g, " ") : undefined;
  const outlet = await updateOutlet(id, {
    name,
    address: typeof body.address === "string" ? body.address.trim() || null : undefined,
    latitude: body.latitude !== undefined ? numberOrNull(body.latitude) : undefined,
    longitude: body.longitude !== undefined ? numberOrNull(body.longitude) : undefined,
    verificationStatus,
  });
  if (!outlet) {
    return NextResponse.json({ error: "Outlet not found." }, { status: 404 });
  }

  await prisma.eventLog.create({
    data: {
      event: "OUTLET_VERIFICATION_UPDATED",
      level: "info",
      metadata: {
        outletId: outlet.id,
        outletName: outlet.name,
        verificationStatus,
        supervisorId: session.user.id,
      },
    },
  });

  return NextResponse.json(outlet);
}

async function updateOutlet(
  id: string,
  input: {
    name?: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    verificationStatus: OutletVerificationStatus;
  },
) {
  try {
    return await prisma.outlet.update({
      where: { id },
      data: {
        ...(input.name
          ? {
              name: input.name,
              normalizedName: normalizeOutletName(input.name),
            }
          : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        verificationStatus: input.verificationStatus,
        verifiedAt: input.verificationStatus === "VERIFIED" ? new Date() : null,
      },
      include: { _count: { select: { visits: true } } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

function parseOutletStatus(value: unknown): OutletVerificationStatus | null {
  if (typeof value === "string" && editableStatuses.some((status) => status === value)) {
    return value as OutletVerificationStatus;
  }
  return null;
}
