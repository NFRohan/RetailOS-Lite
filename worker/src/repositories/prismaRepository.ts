import type { PrismaClient } from "@prisma/client";
import type {
  AIResultRecord,
  EventLogRecord,
  FraudSignal,
  Visit,
  VisitImage,
  VisitReportRecord,
  VisitStatus,
} from "../types/domain.js";
import type { VisitRepository } from "./visitRepository.js";

export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getVisitForAnalysis(visitId: string): Promise<Visit> {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { outlet: true, images: true },
    });
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (visit.images.length === 0) throw new Error(`Visit has no images: ${visitId}`);

    return {
      id: visit.id,
      outletId: visit.outletId,
      repId: visit.repId,
      status: visit.status as VisitStatus,
      checkInLat: visit.checkInLat ?? undefined,
      checkInLng: visit.checkInLng ?? undefined,
      clientTimestamp: visit.clientTimestamp?.toISOString(),
      serverCreatedAt: visit.createdAt.toISOString(),
      notes: visit.notes ?? undefined,
      outlet: {
        id: visit.outlet.id,
        name: visit.outlet.name,
        code: visit.outlet.code,
        latitude: visit.outlet.latitude ?? undefined,
        longitude: visit.outlet.longitude ?? undefined,
      },
      images: visit.images.map((img) => ({
        id: img.id,
        visitId: img.visitId,
        url: img.url,
        localPath: img.localPath ?? undefined,
        imageHash: img.imageHash ?? undefined,
        metadata: img.metadata as Record<string, unknown> | undefined,
      })),
    };
  }

  async updateVisitStatus(visitId: string, status: VisitStatus): Promise<void> {
    await this.prisma.visit.update({ where: { id: visitId }, data: { status } });
  }

  async updateVisitImage(image: VisitImage): Promise<void> {
    await this.prisma.visitImage.update({
      where: { id: image.id },
      data: { imageHash: image.imageHash },
    });
  }

  async findImagesByHash(imageHash: string, excludeVisitId: string): Promise<VisitImage[]> {
    const images = await this.prisma.visitImage.findMany({
      where: {
        imageHash,
        visitId: { not: excludeVisitId },
      },
    });
    return images.map((img) => ({
      id: img.id,
      visitId: img.visitId,
      url: img.url,
      localPath: img.localPath ?? undefined,
      imageHash: img.imageHash ?? undefined,
    }));
  }

  async saveFraudSignals(signals: FraudSignal[]): Promise<void> {
    for (const signal of signals) {
      const existing = await this.prisma.fraudSignal.findFirst({
        where: {
          visitId: signal.visitId,
          type: signal.type,
          message: signal.message,
        },
      });
      if (!existing) {
        await this.prisma.fraudSignal.create({
          data: {
            visitId: signal.visitId,
            type: signal.type,
            severity: signal.severity,
            message: signal.message,
            metadata: signal.metadata ?? undefined,
            createdAt: new Date(signal.createdAt),
          },
        });
      }
    }
  }

  async saveAIResult(result: AIResultRecord): Promise<void> {
    await this.prisma.aIResult.upsert({
      where: { visitId: result.visitId },
      create: {
        visitId: result.visitId,
        analysisSource: result.analysisSource,
        detectorModel: result.detectorModel,
        detectorVersion: result.detectorVersion,
        complianceScore: result.complianceScore,
        status: result.status,
        supervisorSummary: result.supervisorSummary,
        yoloDetections: result.yoloDetections ?? undefined,
        detectedProducts: result.detectedProducts as object,
        competitors: result.competitors as object,
        posm: result.posm ?? undefined,
        overlayImageUrl: result.overlayImageUrl,
        outcomeSummary: result.outcomeSummary ?? undefined,
        rawModelOutput: result.rawModelOutput as object,
        createdAt: new Date(result.createdAt),
      },
      update: {
        analysisSource: result.analysisSource,
        detectorModel: result.detectorModel,
        detectorVersion: result.detectorVersion,
        complianceScore: result.complianceScore,
        status: result.status,
        supervisorSummary: result.supervisorSummary,
        yoloDetections: result.yoloDetections ?? undefined,
        detectedProducts: result.detectedProducts as object,
        competitors: result.competitors as object,
        posm: result.posm ?? undefined,
        overlayImageUrl: result.overlayImageUrl,
        outcomeSummary: result.outcomeSummary ?? undefined,
        rawModelOutput: result.rawModelOutput as object,
      },
    });
  }

  async saveVisitReport(report: VisitReportRecord): Promise<void> {
    await this.prisma.visitReport.upsert({
      where: { visitId: report.visitId },
      create: {
        visitId: report.visitId,
        outletId: report.outletId,
        title: report.title,
        summary: report.summary,
        retrievalText: report.retrievalText,
        facts: report.facts,
        createdAt: new Date(report.createdAt),
      },
      update: {
        title: report.title,
        summary: report.summary,
        retrievalText: report.retrievalText,
        facts: report.facts,
      },
    });
  }

  async addEvent(event: EventLogRecord): Promise<void> {
    await this.prisma.eventLog.create({
      data: {
        visitId: event.visitId,
        jobId: event.jobId,
        event: event.event,
        level: event.level,
        traceId: event.traceId,
        metadata: event.metadata ?? undefined,
        createdAt: new Date(event.createdAt),
      },
    });
  }
}
