import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitDetail, serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSupervisor = session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";

  const visits = await prisma.visit.findMany({
    where: isSupervisor ? undefined : { repId: session.user.id },
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(visits.map(serializeVisitListItem));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const visit = await prisma.visit.create({
    data: {
      clientVisitId: body.clientVisitId,
      outletId: body.outletId,
      repId: session.user.id,
      checkInLat: body.checkInLat,
      checkInLng: body.checkInLng,
      clientTimestamp: body.clientTimestamp ? new Date(body.clientTimestamp) : new Date(),
      notes: body.notes,
      status: "PENDING",
    },
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
  });

  return NextResponse.json(serializeVisitDetail(visit), { status: 201 });
}
