import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { numberOrNull, OutletResolutionError, resolveOutletForVisit } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { serializeVisitDetail, serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSupervisor = session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";
  const searchParams = request.nextUrl.searchParams;
  const paginated = wantsPaginatedVisitLogs(searchParams);
  const where = visitLogWhere(searchParams, {
    isSupervisor,
    userId: session.user.id,
  });

  const visits = await prisma.visit.findMany({
    where,
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = visits.map(serializeVisitListItem);
  if (!paginated) {
    return NextResponse.json(serialized);
  }

  const filtered = filterByRiskStatus(serialized, searchParams.get("status"));
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(100, positiveInt(searchParams.get("pageSize"), 10));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return NextResponse.json({
    items: filtered.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    facets: {
      all: serialized.length,
      safe: serialized.filter((visit) => visit.riskStatus === "SAFE").length,
      flagged: serialized.filter((visit) => visit.riskStatus !== "SAFE").length,
      reviewNeeded: serialized.filter((visit) => visit.riskStatus === "REVIEW_NEEDED").length,
      highRisk: serialized.filter((visit) => visit.riskStatus === "HIGH_RISK").length,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  try {
    const checkInLat = numberOrNull(body.checkInLat);
    const checkInLng = numberOrNull(body.checkInLng);
    const outletResolution = await resolveOutletForVisit({
      outletId: body.outletId,
      outletName: body.outletName,
      checkInLat,
      checkInLng,
    });

    const visit = await prisma.visit.create({
      data: {
        clientVisitId: body.clientVisitId,
        outletId: outletResolution.outlet.id,
        repId: session.user.id,
        checkInLat,
        checkInLng,
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

    if (outletResolution.created) {
      await prisma.outlet.update({
        where: { id: outletResolution.outlet.id },
        data: { createdByVisitId: visit.id },
      });

      await prisma.eventLog.create({
        data: {
          visitId: visit.id,
          event: "OUTLET_AUTO_CREATED",
          level: "info",
          metadata: {
            outletId: outletResolution.outlet.id,
            outletName: outletResolution.outlet.name,
            matchedBy: outletResolution.matchedBy,
          },
        },
      });
    }

    return NextResponse.json(serializeVisitDetail(visit), { status: 201 });
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

function wantsPaginatedVisitLogs(searchParams: URLSearchParams): boolean {
  return ["page", "pageSize", "q", "status", "from", "to", "scope"].some((key) => searchParams.has(key));
}

function visitLogWhere(
  searchParams: URLSearchParams,
  session: { isSupervisor: boolean; userId: string },
): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = {};
  const scope = searchParams.get("scope");

  if (!session.isSupervisor || scope === "mine") {
    where.repId = session.userId;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"), true);
  if (from) createdAt.gte = from;
  if (to) createdAt.lt = to;
  if (createdAt.gte || createdAt.lt) {
    where.createdAt = createdAt;
  }

  const q = searchParams.get("q")?.trim();
  if (q) {
    where.OR = [
      { outlet: { name: { contains: q, mode: "insensitive" } } },
      { outlet: { code: { contains: q, mode: "insensitive" } } },
      { rep: { name: { contains: q, mode: "insensitive" } } },
      { rep: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

function filterByRiskStatus<T extends { riskStatus: string }>(visits: T[], rawStatus: string | null): T[] {
  const status = rawStatus?.toLowerCase();
  if (!status || status === "all" || status === "all-logs") return visits;
  if (status === "safe") return visits.filter((visit) => visit.riskStatus === "SAFE");
  if (status === "flagged") return visits.filter((visit) => visit.riskStatus !== "SAFE");
  if (status === "review" || status === "review-needed") {
    return visits.filter((visit) => visit.riskStatus === "REVIEW_NEEDED");
  }
  if (status === "high-risk" || status === "high") {
    return visits.filter((visit) => visit.riskStatus === "HIGH_RISK");
  }
  return visits;
}

function positiveInt(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function parseDateParam(raw: string | null, endExclusive = false): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  return parsed;
}
