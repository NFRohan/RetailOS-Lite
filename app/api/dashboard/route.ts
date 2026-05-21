import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const visits = await prisma.visit.findMany({
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const visitsToday = visits.filter((v) => v.createdAt >= startOfToday).length;
  const withScores = visits.filter((v) => v.aiResult);
  const avgComplianceScore =
    withScores.length > 0
      ? Math.round(withScores.reduce((sum, v) => sum + (v.aiResult?.complianceScore ?? 0), 0) / withScores.length)
      : 0;
  const flaggedCount = visits.filter((v) => v.status === "FLAGGED").length;
  const outletsBelowThreshold = new Set(
    withScores.filter((v) => (v.aiResult?.complianceScore ?? 100) < 60).map((v) => v.outletId),
  ).size;

  const serialized = visits.map(serializeVisitListItem);
  const needsAttention = [...serialized]
    .filter((v) => v.complianceScore !== null)
    .sort((a, b) => (a.complianceScore ?? 100) - (b.complianceScore ?? 100))
    .slice(0, 5);

  return NextResponse.json({
    visitsToday,
    avgComplianceScore,
    flaggedCount,
    outletsBelowThreshold,
    visits: serialized,
    needsAttention,
  });
}
