import type { OutletVerificationStatus, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeOutletName, numberOrNull } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const outletStatuses = ["VERIFIED", "UNVERIFIED", "REJECTED"] as const;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = parseOutletStatus(request.nextUrl.searchParams.get("status"));
  const where: Prisma.OutletWhereInput = status ? { verificationStatus: status } : {};
  const outlets = await prisma.outlet.findMany({
    where,
    include: { _count: { select: { visits: true } } },
    orderBy: status === "UNVERIFIED" ? { createdAt: "desc" } : { name: "asc" },
  });
  return NextResponse.json(outlets);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const outlet = await prisma.outlet.create({
    data: {
      name: body.name,
      normalizedName: normalizeOutletName(body.name),
      code: body.code,
      address: body.address,
      latitude: numberOrNull(body.latitude),
      longitude: numberOrNull(body.longitude),
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
    },
  });
  return NextResponse.json(outlet, { status: 201 });
}

function parseOutletStatus(value: string | null): OutletVerificationStatus | null {
  if (outletStatuses.some((status) => status === value)) {
    return value as OutletVerificationStatus;
  }
  return null;
}
