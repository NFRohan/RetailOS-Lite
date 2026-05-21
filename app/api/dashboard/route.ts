import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

type DailyAggregateRow = {
  date: string | Date;
  visits: number | bigint;
  avgComplianceScore: number | bigint | null;
  scoredVisits: number | bigint;
  posmPresent: number | bigint;
  posmMissing: number | bigint;
  fraudDetections: number | bigint;
};

type NormalizedDailyAggregate = {
  date: string;
  visits: number;
  avgComplianceScore: number;
  scoredVisits: number;
  posmPresent: number;
  posmMissing: number;
  fraudDetections: number;
  posmCompliancePct: number;
  qualityScore: number;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rangeDays = rangeDaysFrom(request.nextUrl.searchParams.get("range"));
  const todayStart = startOfUtcDay(new Date());
  const tomorrowStart = addDays(todayStart, 1);
  const currentStart = addDays(tomorrowStart, -rangeDays);
  const previousStart = addDays(currentStart, -rangeDays);

  const [trend, previousTrend] = await Promise.all([
    dailyAggregates(currentStart, tomorrowStart),
    dailyAggregates(previousStart, currentStart),
  ]);

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

  const withScores = visits.filter((v) => v.aiResult);
  const flaggedCount = visits.filter((v) => v.status === "FLAGGED").length;
  const outletsBelowThreshold = new Set(
    withScores.filter((v) => (v.aiResult?.complianceScore ?? 100) < 60).map((v) => v.outletId),
  ).size;

  const serialized = visits.map(serializeVisitListItem);
  const needsAttention = [...serialized]
    .filter((v) => v.status === "FLAGGED" || v.hasHighFraud || (v.complianceScore !== null && v.complianceScore < 60))
    .sort((a, b) => (a.complianceScore ?? 100) - (b.complianceScore ?? 100))
    .slice(0, 5);
  const currentSummary = summarizeTrend(trend);
  const previousSummary = summarizeTrend(previousTrend);
  const today = trend.find((point) => point.date === dateKey(todayStart));
  const yesterday = trend.find((point) => point.date === dateKey(addDays(todayStart, -1)));
  const visitsToday = today?.visits ?? 0;
  const visitsYesterday = yesterday?.visits ?? 0;

  const summary = {
    rangeDays,
    visitsToday,
    visitsDeltaPct: percentChange(visitsToday, visitsYesterday),
    avgComplianceScore: currentSummary.avgComplianceScore,
    previousAvgComplianceScore: previousSummary.avgComplianceScore,
    avgComplianceDeltaPct: percentChange(currentSummary.avgComplianceScore, previousSummary.avgComplianceScore),
    missingPosmCount: currentSummary.posmMissing,
    fraudDetectionCount: currentSummary.fraudDetections,
    flaggedFraudCount: currentSummary.fraudDetections,
    posmCompliancePct: currentSummary.posmCompliancePct,
    posmComplianceDeltaPct: currentSummary.posmCompliancePct - previousSummary.posmCompliancePct,
    qualityScore: currentSummary.qualityScore,
    qualityDeltaPct: percentChange(currentSummary.qualityScore, previousSummary.qualityScore),
  };

  return NextResponse.json({
    visitsToday,
    avgComplianceScore: summary.avgComplianceScore,
    flaggedCount,
    outletsBelowThreshold,
    visits: serialized,
    needsAttention,
    recentVisits: serialized.slice(0, 5),
    summary,
    trend: trend.map((point) => ({
      date: point.date,
      visits: point.visits,
      avgComplianceScore: point.avgComplianceScore,
      posmCompliancePct: point.posmCompliancePct,
      qualityScore: point.qualityScore,
      fraudDetections: point.fraudDetections,
      missingPosm: point.posmMissing,
    })),
  });
}

async function dailyAggregates(start: Date, endExclusive: Date): Promise<NormalizedDailyAggregate[]> {
  const rows = await prisma.$queryRaw<DailyAggregateRow[]>`
    WITH days AS (
      SELECT generate_series(${start}::date, (${endExclusive}::date - interval '1 day'), interval '1 day')::date AS day
    ),
    visit_daily AS (
      SELECT
        date_trunc('day', v."createdAt")::date AS day,
        count(*)::int AS visits,
        round(avg(ar."complianceScore"))::int AS "avgComplianceScore",
        count(*) FILTER (WHERE ar."complianceScore" IS NOT NULL)::int AS "scoredVisits",
        count(*) FILTER (WHERE ar."posm"->>'detected' = 'true')::int AS "posmPresent",
        count(*) FILTER (WHERE ar."posm"->>'detected' = 'false')::int AS "posmMissing"
      FROM "Visit" v
      LEFT JOIN "AIResult" ar ON ar."visitId" = v.id
      WHERE v."createdAt" >= ${start} AND v."createdAt" < ${endExclusive}
      GROUP BY day
    ),
    fraud_daily AS (
      SELECT
        date_trunc('day', v."createdAt")::date AS day,
        count(f.id)::int AS "fraudDetections"
      FROM "Visit" v
      JOIN "FraudSignal" f ON f."visitId" = v.id
      WHERE v."createdAt" >= ${start} AND v."createdAt" < ${endExclusive}
      GROUP BY day
    )
    SELECT
      d.day::text AS date,
      COALESCE(vd.visits, 0)::int AS visits,
      COALESCE(vd."avgComplianceScore", 0)::int AS "avgComplianceScore",
      COALESCE(vd."scoredVisits", 0)::int AS "scoredVisits",
      COALESCE(vd."posmPresent", 0)::int AS "posmPresent",
      COALESCE(vd."posmMissing", 0)::int AS "posmMissing",
      COALESCE(fd."fraudDetections", 0)::int AS "fraudDetections"
    FROM days d
    LEFT JOIN visit_daily vd ON vd.day = d.day
    LEFT JOIN fraud_daily fd ON fd.day = d.day
    ORDER BY d.day ASC
  `;

  return rows.map((row) => {
    const visits = toNumber(row.visits);
    const fraudDetections = toNumber(row.fraudDetections);
    const posmPresent = toNumber(row.posmPresent);
    const posmMissing = toNumber(row.posmMissing);
    const knownPosm = posmPresent + posmMissing;

    return {
      date: normalizeDateKey(row.date),
      visits,
      avgComplianceScore: toNumber(row.avgComplianceScore),
      scoredVisits: toNumber(row.scoredVisits),
      posmPresent,
      posmMissing,
      fraudDetections,
      posmCompliancePct: knownPosm > 0 ? Math.round((posmPresent / knownPosm) * 100) : 0,
      qualityScore: visits > 0 ? Math.max(0, Math.round(((visits - fraudDetections) / visits) * 100)) : 0,
    };
  });
}

function summarizeTrend(points: NormalizedDailyAggregate[]) {
  const visits = sum(points, "visits");
  const scoredVisits = sum(points, "scoredVisits");
  const weightedCompliance = points.reduce((total, point) => total + point.avgComplianceScore * point.scoredVisits, 0);
  const posmPresent = sum(points, "posmPresent");
  const posmMissing = sum(points, "posmMissing");
  const knownPosm = posmPresent + posmMissing;
  const fraudDetections = sum(points, "fraudDetections");

  return {
    visits,
    avgComplianceScore: scoredVisits > 0 ? Math.round(weightedCompliance / scoredVisits) : 0,
    posmMissing,
    fraudDetections,
    posmCompliancePct: knownPosm > 0 ? Math.round((posmPresent / knownPosm) * 100) : 0,
    qualityScore: visits > 0 ? Math.max(0, Math.round(((visits - fraudDetections) / visits) * 100)) : 0,
  };
}

function sum(points: NormalizedDailyAggregate[], key: keyof NormalizedDailyAggregate): number {
  return points.reduce((total, point) => total + Number(point[key] ?? 0), 0);
}

function rangeDaysFrom(raw: string | null): number {
  const parsed = raw?.match(/^(\d+)d$/)?.[1] ?? raw ?? "7";
  const days = Number(parsed);
  if (!Number.isFinite(days)) return 7;
  return Math.min(90, Math.max(1, Math.trunc(days)));
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function toNumber(value: number | bigint | null): number {
  if (value === null) return 0;
  return Number(value);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDateKey(value: string | Date): string {
  return value instanceof Date ? dateKey(value) : value.slice(0, 10);
}
