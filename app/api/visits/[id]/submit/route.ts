import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueAnalyzeVisit } from "@/lib/queue";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: visitId } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { images: true },
  });

  if (!visit || visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (visit.images.length === 0) {
    return NextResponse.json({ error: "Upload at least one shelf image" }, { status: 400 });
  }

  if (visit.status !== "PENDING") {
    return NextResponse.json({ status: visit.status, traceId: null });
  }

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "ANALYZING" },
  });

  await prisma.eventLog.create({
    data: {
      visitId,
      event: "VISIT_SUBMITTED",
      level: "info",
      metadata: { repId: session.user.id },
    },
  });

  const traceId = await enqueueAnalyzeVisit(visitId, true);

  return NextResponse.json({ status: "ANALYZING", traceId });
}
