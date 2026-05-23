import { randomUUID } from "node:crypto";
import { Prisma, type Outlet, type OutletSubmission } from "@prisma/client";
import { notifyOutletApprovalNeeded } from "@/lib/outlet-approval-alerts";
import { prisma } from "@/lib/prisma";

const AUTO_OUTLET_CODE_PREFIX = "AUTO";
const OUTLET_SEARCH_RADIUS_METERS = 100;
const AUTO_MATCH_RADIUS_METERS = 75;
const GEO_SCORE_DECAY_METERS = 300;
const AUTO_MATCH_CONFIDENCE = 0.9;
const REVIEW_MATCH_CONFIDENCE = 0.6;
const AUTO_MATCH_MARGIN = 0.12;
const NAME_WEIGHT = 0.6;
const GEO_WEIGHT = 0.4;

type OutletWithAliases = Prisma.OutletGetPayload<{
  include: {
    aliases: true;
    _count: { select: { visits: true } };
  };
}>;

export class OutletResolutionError extends Error {
  status = 400;
}

export type OutletSearchCandidate = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: string;
  distanceMeters: number;
  nameSimilarity: number;
  geoSimilarity: number;
  confidence: number;
  visitCount: number;
  matchedAlias: string | null;
};

export type OutletSearchResult = {
  query: string;
  normalizedQuery: string;
  radiusMeters: number;
  candidates: OutletSearchCandidate[];
  autoMatch: OutletSearchCandidate | null;
  canCreateNew: boolean;
};

export type OutletResolution = {
  outlet: Outlet;
  outletSubmission: OutletSubmission | null;
  created: boolean;
  matchedBy: "legacy_id" | "rep_selected" | "auto_match" | "new_outlet";
};

export async function resolveOutletForVisit({
  repId,
  outletId,
  outletName,
  checkInLat,
  checkInLng,
  forceNewOutlet,
}: {
  repId: string;
  outletId?: unknown;
  outletName?: unknown;
  checkInLat?: unknown;
  checkInLng?: unknown;
  forceNewOutlet?: unknown;
}): Promise<OutletResolution> {
  return submitOutletSelection({
    repId,
    submittedName: outletName,
    submittedLat: checkInLat,
    submittedLng: checkInLng,
    selectedOutletId: outletId,
    forceNewOutlet: Boolean(forceNewOutlet),
  });
}

export async function searchOutletCandidates({
  query,
  lat,
  lng,
  radiusMeters = OUTLET_SEARCH_RADIUS_METERS,
}: {
  query: unknown;
  lat: unknown;
  lng: unknown;
  radiusMeters?: number;
}): Promise<OutletSearchResult> {
  const submittedName = parseOutletName(query);
  const normalizedQuery = normalizeOutletName(submittedName);
  const submittedLat = requiredNumber(lat, "GPS latitude is required for outlet search.");
  const submittedLng = requiredNumber(lng, "GPS longitude is required for outlet search.");

  const outlets = await prisma.outlet.findMany({
    where: { verificationStatus: { not: "REJECTED" } },
    include: {
      aliases: true,
      _count: { select: { visits: true } },
    },
    take: 500,
  });

  const candidates = outlets
    .map((outlet) => scoreOutletCandidate(outlet, normalizedQuery, submittedLat, submittedLng))
    .filter((candidate): candidate is OutletSearchCandidate => Boolean(candidate))
    .filter((candidate) => candidate.distanceMeters <= radiusMeters)
    .sort((a, b) => b.confidence - a.confidence || a.distanceMeters - b.distanceMeters)
    .slice(0, 8);

  const autoMatch = autoMatchCandidate(candidates);

  return {
    query: submittedName,
    normalizedQuery,
    radiusMeters,
    candidates,
    autoMatch,
    canCreateNew: true,
  };
}

export async function submitOutletSelection({
  repId,
  submittedName,
  submittedLat,
  submittedLng,
  selectedOutletId,
  forceNewOutlet = false,
}: {
  repId: string;
  submittedName?: unknown;
  submittedLat?: unknown;
  submittedLng?: unknown;
  selectedOutletId?: unknown;
  forceNewOutlet?: boolean;
}): Promise<OutletResolution> {
  const explicitOutletId = stringOrNull(selectedOutletId);
  const selectedOutlet = explicitOutletId
    ? await prisma.outlet.findUnique({
        where: { id: explicitOutletId },
        include: { aliases: true, _count: { select: { visits: true } } },
      })
    : null;

  if (explicitOutletId && !selectedOutlet) {
    throw new OutletResolutionError("Selected outlet was not found.");
  }

  const fallbackName = selectedOutlet?.name;
  const name = parseOutletName(typeof submittedName === "string" && submittedName.trim() ? submittedName : fallbackName);
  const normalizedName = normalizeOutletName(name);
  const lat = numberOrNull(submittedLat);
  const lng = numberOrNull(submittedLng);
  const possibleMatches = lat !== null && lng !== null ? await searchOutletCandidates({ query: name, lat, lng }) : null;

  if (selectedOutlet) {
    const selectedCandidate =
      possibleMatches?.candidates.find((candidate) => candidate.id === selectedOutlet.id) ??
      (lat !== null && lng !== null ? scoreOutletCandidate(selectedOutlet, normalizedName, lat, lng) : null);

    if (selectedCandidate && selectedCandidate.distanceMeters > OUTLET_SEARCH_RADIUS_METERS) {
      throw new OutletResolutionError("Selected outlet is not near the current GPS location.");
    }

    const submission = await prisma.outletSubmission.create({
      data: {
        repId,
        submittedName: name,
        normalizedName,
        submittedLat: lat,
        submittedLng: lng,
        matchedOutletId: selectedOutlet.id,
        matchConfidence: selectedCandidate?.confidence ?? null,
        status:
          selectedCandidate && isAutoConfidence(selectedCandidate, possibleMatches?.candidates ?? [])
            ? "AUTO_MATCHED"
            : "PENDING_REVIEW",
        possibleMatches: toPossibleMatchesJson(possibleMatches?.candidates ?? []),
      },
    });

    if (submission.status === "AUTO_MATCHED") {
      await createOutletAlias(selectedOutlet.id, name, submission.id);
    } else if (submission.status === "PENDING_REVIEW") {
      queueOutletApprovalAlert(repId, name, submission.status);
    }

    return {
      outlet: selectedOutlet,
      outletSubmission: submission,
      created: false,
      matchedBy: submission.status === "AUTO_MATCHED" ? "auto_match" : "rep_selected",
    };
  }

  if (possibleMatches?.autoMatch && !forceNewOutlet) {
    const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: possibleMatches.autoMatch.id } });
    const submission = await prisma.outletSubmission.create({
      data: {
        repId,
        submittedName: name,
        normalizedName,
        submittedLat: lat,
        submittedLng: lng,
        matchedOutletId: outlet.id,
        matchConfidence: possibleMatches.autoMatch.confidence,
        status: "AUTO_MATCHED",
        possibleMatches: toPossibleMatchesJson(possibleMatches.candidates),
      },
    });
    await createOutletAlias(outlet.id, name, submission.id);
    return { outlet, outletSubmission: submission, created: false, matchedBy: "auto_match" };
  }

  const topCandidate = possibleMatches?.candidates[0] ?? null;
  const outlet = await prisma.outlet.create({
    data: {
      name,
      normalizedName,
      code: await generateAutoOutletCode(),
      latitude: lat,
      longitude: lng,
      verificationStatus: "UNVERIFIED",
      createdById: repId,
    },
  });

  const submission = await prisma.outletSubmission.create({
    data: {
      repId,
      submittedName: name,
      normalizedName,
      submittedLat: lat,
      submittedLng: lng,
      matchedOutletId: topCandidate?.id ?? null,
      createdOutletId: outlet.id,
      matchConfidence: topCandidate?.confidence ?? null,
      status: topCandidate && topCandidate.confidence >= REVIEW_MATCH_CONFIDENCE ? "PENDING_REVIEW" : "NEW_OUTLET",
      possibleMatches: toPossibleMatchesJson(possibleMatches?.candidates ?? []),
    },
  });

  if (submission.status === "NEW_OUTLET" || submission.status === "PENDING_REVIEW") {
    queueOutletApprovalAlert(repId, name, submission.status);
  }

  return { outlet, outletSubmission: submission, created: true, matchedBy: "new_outlet" };
}

export async function approveOutlet({
  outletId,
  supervisorId,
  submissionId,
}: {
  outletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  const outlet = await prisma.outlet.update({
    where: { id: outletId },
    data: {
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      approvedById: supervisorId,
    },
    include: { _count: { select: { visits: true } } },
  });

  if (submissionId) {
    const submission = await prisma.outletSubmission.update({
      where: { id: submissionId },
      data: {
        status: "APPROVED",
        matchedOutletId: outlet.id,
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });
    await createOutletAlias(outlet.id, submission.submittedName, submission.id);
  }

  return outlet;
}

export async function rejectOutlet({
  outletId,
  supervisorId,
  submissionId,
}: {
  outletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  const submission = submissionId
    ? await prisma.outletSubmission.findUnique({ where: { id: submissionId } })
    : await prisma.outletSubmission.findFirst({ where: { createdOutletId: outletId }, orderBy: { createdAt: "desc" } });

  if (submission) {
    await prisma.outletSubmission.update({
      where: { id: submission.id },
      data: {
        status: "REJECTED",
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });
  }

  const shouldRejectOutlet = !submission || submission.createdOutletId === outletId;
  if (!shouldRejectOutlet) {
    return prisma.outlet.findUniqueOrThrow({
      where: { id: outletId },
      include: { _count: { select: { visits: true } } },
    });
  }

  return prisma.outlet.update({
    where: { id: outletId },
    data: {
      verificationStatus: "REJECTED",
      approvedById: supervisorId,
    },
    include: { _count: { select: { visits: true } } },
  });
}

export async function mergeOutlet({
  sourceOutletId,
  targetOutletId,
  supervisorId,
  submissionId,
}: {
  sourceOutletId: string;
  targetOutletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  if (sourceOutletId === targetOutletId) {
    throw new OutletResolutionError("Source and target outlets must be different.");
  }

  return prisma.$transaction(async (tx) => {
    const [sourceOutlet, targetOutlet] = await Promise.all([
      tx.outlet.findUnique({ where: { id: sourceOutletId } }),
      tx.outlet.findUnique({ where: { id: targetOutletId } }),
    ]);

    if (!sourceOutlet || !targetOutlet) {
      throw new OutletResolutionError("Could not find both outlets for merge.");
    }

    await tx.visit.updateMany({ where: { outletId: sourceOutletId }, data: { outletId: targetOutletId } });
    await tx.visitReport.updateMany({ where: { outletId: sourceOutletId }, data: { outletId: targetOutletId } });
    await tx.outletSubmission.updateMany({
      where: { createdOutletId: sourceOutletId },
      data: {
        status: "MERGED",
        matchedOutletId: targetOutletId,
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });

    if (submissionId) {
      await tx.outletSubmission.update({
        where: { id: submissionId },
        data: {
          status: "MERGED",
          matchedOutletId: targetOutletId,
          reviewedById: supervisorId,
          reviewedAt: new Date(),
        },
      });
    }

    await tx.outlet.update({
      where: { id: sourceOutletId },
      data: {
        verificationStatus: "REJECTED",
        approvedById: supervisorId,
      },
    });

    await upsertOutletAlias(tx, targetOutletId, sourceOutlet.name, submissionId ?? null);
    await upsertOutletAlias(tx, targetOutletId, normalizeOutletName(sourceOutlet.name), submissionId ?? null);

    return tx.outlet.findUniqueOrThrow({
      where: { id: targetOutletId },
      include: { _count: { select: { visits: true } } },
    });
  });
}

export function normalizeOutletName(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function scoreOutletCandidate(
  outlet: OutletWithAliases,
  normalizedQuery: string,
  submittedLat: number,
  submittedLng: number,
): OutletSearchCandidate | null {
  if (outlet.latitude === null || outlet.longitude === null) return null;

  const distanceMeters = haversineMeters(submittedLat, submittedLng, outlet.latitude, outlet.longitude);
  const aliasScores = outlet.aliases.map((alias) => ({
    alias: alias.aliasName,
    score: fuzzyNameSimilarity(normalizedQuery, alias.normalizedAlias),
  }));
  const canonicalScore = fuzzyNameSimilarity(normalizedQuery, outlet.normalizedName ?? normalizeOutletName(outlet.name));
  const bestAlias = aliasScores.sort((a, b) => b.score - a.score)[0] ?? null;
  const nameSimilarity = Math.max(canonicalScore, bestAlias?.score ?? 0);
  const geoSimilarity = Math.max(0, 1 - distanceMeters / GEO_SCORE_DECAY_METERS);
  const confidence = roundScore(nameSimilarity * NAME_WEIGHT + geoSimilarity * GEO_WEIGHT);

  return {
    id: outlet.id,
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    latitude: outlet.latitude,
    longitude: outlet.longitude,
    verificationStatus: outlet.verificationStatus,
    distanceMeters: Math.round(distanceMeters),
    nameSimilarity: roundScore(nameSimilarity),
    geoSimilarity: roundScore(geoSimilarity),
    confidence,
    visitCount: outlet._count.visits,
    matchedAlias: bestAlias && bestAlias.score > canonicalScore ? bestAlias.alias : null,
  };
}

function autoMatchCandidate(candidates: OutletSearchCandidate[]): OutletSearchCandidate | null {
  const [topCandidate, secondCandidate] = candidates;
  if (!topCandidate) return null;
  return isAutoConfidence(topCandidate, candidates, secondCandidate) ? topCandidate : null;
}

function isAutoConfidence(
  candidate: OutletSearchCandidate,
  candidates: OutletSearchCandidate[],
  secondCandidate = candidates.find((item) => item.id !== candidate.id),
): boolean {
  const margin = candidate.confidence - (secondCandidate?.confidence ?? 0);
  return (
    candidate.confidence >= AUTO_MATCH_CONFIDENCE &&
    candidate.distanceMeters <= AUTO_MATCH_RADIUS_METERS &&
    margin >= AUTO_MATCH_MARGIN
  );
}

function fuzzyNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const tokenUnion = new Set([...aTokens, ...bTokens]);
  const tokenIntersection = [...aTokens].filter((token) => bTokens.has(token));
  const tokenScore = tokenUnion.size === 0 ? 0 : tokenIntersection.length / tokenUnion.size;
  const trigramScore = diceCoefficient(trigrams(a), trigrams(b));

  return Math.max(tokenScore * 0.95, trigramScore);
}

function trigrams(value: string): string[] {
  const padded = `  ${value}  `;
  const grams: string[] = [];
  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.push(padded.slice(index, index + 3));
  }
  return grams;
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bCounts = new Map<string, number>();
  for (const gram of b) {
    bCounts.set(gram, (bCounts.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const gram of a) {
    const count = bCounts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      bCounts.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (a.length + b.length);
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

async function generateAutoOutletCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `${AUTO_OUTLET_CODE_PREFIX}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const existing = await prisma.outlet.findUnique({ where: { code } });
    if (!existing) return code;
  }

  throw new OutletResolutionError("Could not generate a unique outlet code.");
}

async function createOutletAlias(outletId: string, aliasName: string, sourceSubmissionId: string | null) {
  return upsertOutletAlias(prisma, outletId, aliasName, sourceSubmissionId);
}

async function upsertOutletAlias(
  client: Pick<typeof prisma, "outletAlias">,
  outletId: string,
  aliasName: string,
  sourceSubmissionId: string | null,
) {
  const normalizedAlias = normalizeOutletName(aliasName);
  if (!normalizedAlias) return null;

  return client.outletAlias.upsert({
    where: {
      outletId_normalizedAlias: {
        outletId,
        normalizedAlias,
      },
    },
    update: {
      aliasName,
      sourceSubmissionId,
    },
    create: {
      outletId,
      aliasName,
      normalizedAlias,
      sourceSubmissionId,
    },
  });
}

function toPossibleMatchesJson(candidates: OutletSearchCandidate[]): Prisma.InputJsonValue {
  return candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    code: candidate.code,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    verificationStatus: candidate.verificationStatus,
    distanceMeters: candidate.distanceMeters,
    nameSimilarity: candidate.nameSimilarity,
    geoSimilarity: candidate.geoSimilarity,
    confidence: candidate.confidence,
    visitCount: candidate.visitCount,
    matchedAlias: candidate.matchedAlias,
  }));
}

function requiredNumber(value: unknown, message: string): number {
  const parsed = numberOrNull(value);
  if (parsed === null) {
    throw new OutletResolutionError(message);
  }
  return parsed;
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

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function queueOutletApprovalAlert(
  repId: string,
  storeName: string,
  submissionStatus: "NEW_OUTLET" | "PENDING_REVIEW",
) {
  void notifyOutletApprovalNeeded({ repId, storeName, submissionStatus }).catch((error) => {
    console.error("[outlet-approval-alerts] Failed:", error);
  });
}
