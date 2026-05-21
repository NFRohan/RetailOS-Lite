import type { Prisma } from "@prisma/client";
import type { OutcomeSummary, VisitDetail, VisitListItem } from "@/lib/types";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: {
    outlet: true;
    rep: { select: { id: true; name: true; email: true } };
    images: true;
    aiResult: true;
    fraudSignals: true;
  };
}>;

export function serializeVisitDetail(visit: VisitWithRelations): VisitDetail {
  const outcome = visit.aiResult?.outcomeSummary as OutcomeSummary | null;
  return {
    id: visit.id,
    status: visit.status,
    checkInLat: visit.checkInLat,
    checkInLng: visit.checkInLng,
    clientTimestamp: visit.clientTimestamp?.toISOString() ?? null,
    notes: visit.notes,
    createdAt: visit.createdAt.toISOString(),
    outlet: {
      id: visit.outlet.id,
      name: visit.outlet.name,
      code: visit.outlet.code,
      address: visit.outlet.address,
      latitude: visit.outlet.latitude,
      longitude: visit.outlet.longitude,
    },
    rep: visit.rep,
    images: visit.images.map((img) => ({
      id: img.id,
      url: img.url,
      localPath: img.localPath,
      imageHash: img.imageHash,
    })),
    aiResult: visit.aiResult
      ? {
          complianceScore: visit.aiResult.complianceScore,
          status: visit.aiResult.status,
          supervisorSummary: visit.aiResult.supervisorSummary,
          overlayImageUrl: visit.aiResult.overlayImageUrl,
          outcomeSummary: outcome,
          yoloDetections: visit.aiResult.yoloDetections,
        }
      : null,
    fraudSignals: visit.fraudSignals.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      message: f.message,
    })),
  };
}

export function serializeVisitListItem(visit: VisitWithRelations): VisitListItem {
  const outcome = visit.aiResult?.outcomeSummary as OutcomeSummary | null;
  const highFraud = visit.fraudSignals.some((f) => f.severity === "HIGH");
  return {
    id: visit.id,
    status: visit.status,
    createdAt: visit.createdAt.toISOString(),
    outletName: visit.outlet.name,
    outletCode: visit.outlet.code,
    repName: visit.rep.name,
    complianceScore: visit.aiResult?.complianceScore ?? null,
    complianceStatus: visit.aiResult?.status ?? outcome?.complianceStatus ?? null,
    supervisorSummary: visit.aiResult?.supervisorSummary ?? outcome?.supervisorSummary ?? null,
    fraudCount: visit.fraudSignals.length,
    hasHighFraud: highFraud,
  };
}
