import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitDetail } from "@/lib/visits";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
  });

  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSupervisor = session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";
  if (!isSupervisor && visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(serializeVisitDetail(visit));
}
