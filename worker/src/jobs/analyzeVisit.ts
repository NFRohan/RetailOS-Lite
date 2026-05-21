import type { Job } from "bullmq";
import { config } from "../config.js";
import type { AIServiceClient } from "../services/aiService.js";
import { runContextualFraudChecks } from "../services/fraud.js";
import { buildOutcomeSummary } from "../services/outcomeSummary.js";
import { buildVisitReport } from "../services/reportBuilder.js";
import type { AnalyzeShelfResponse } from "../types/ai.js";
import type { AnalyzeVisitJobData, AIResultRecord, Visit } from "../types/domain.js";
import type { VisitRepository } from "../repositories/visitRepository.js";

type AnalyzeVisitDeps = {
  repository: VisitRepository;
  aiService: AIServiceClient;
  enqueueVisitReport?: (visitId: string) => Promise<void>;
};

const nowIso = () => new Date().toISOString();

export async function analyzeVisit(
  jobData: AnalyzeVisitJobData,
  deps: AnalyzeVisitDeps,
  job?: Job<AnalyzeVisitJobData>,
): Promise<AIResultRecord> {
  const { repository, aiService } = deps;
  const startedAt = Date.now();

  await repository.addEvent({
    visitId: jobData.visitId,
    jobId: job?.id,
    event: "ANALYZE_VISIT_STARTED",
    level: "info",
    traceId: jobData.traceId,
    metadata: { queue: job?.queueName },
    createdAt: nowIso(),
  });

  await repository.updateVisitStatus(jobData.visitId, "ANALYZING");

  try {
    const visit = await repository.getVisitForAnalysis(jobData.visitId);
    const primaryImage = selectPrimaryImage(visit);
    const fraudSignals = await runContextualFraudChecks(visit, repository);
    const analysis = await aiService.analyzeShelf({
      visitId: visit.id,
      imagePath: primaryImage.localPath,
      imageUrl: primaryImage.url,
      saveOverlay: true,
      useLlm: jobData.useLlm ?? config.defaultLlmEnabled,
      outletName: visit.outlet.name,
      repNotes: visit.notes,
    });

    const aiResult = toAIResult(visit, analysis);
    const highSeverityFraud = fraudSignals.some((signal) => signal.severity === "HIGH");
    const finalStatus = highSeverityFraud || analysis.compliance.status === "critical" ? "FLAGGED" : "COMPLETE";
    const outcomeSummary = buildOutcomeSummary(visit, analysis, fraudSignals, finalStatus);
    const report = buildVisitReport(visit, analysis, fraudSignals);
    aiResult.outcomeSummary = outcomeSummary;

    await repository.saveFraudSignals(fraudSignals);
    await repository.saveAIResult(aiResult);
    await repository.saveVisitReport(report);
    await repository.updateVisitStatus(visit.id, finalStatus);

    if (deps.enqueueVisitReport) {
      await deps.enqueueVisitReport(visit.id);
    }

    await repository.addEvent({
      visitId: visit.id,
      jobId: job?.id,
      event: "ANALYZE_VISIT_COMPLETED",
      level: "info",
      traceId: jobData.traceId,
      metadata: {
        durationMs: Date.now() - startedAt,
        complianceScore: analysis.compliance.score,
        finalStatus,
        fraudSignalCount: fraudSignals.length,
        analysisSource: analysis.yolo.analysisSource,
        outcomeSummary,
      },
      createdAt: nowIso(),
    });

    return aiResult;
  } catch (error) {
    await repository.updateVisitStatus(jobData.visitId, "FAILED").catch(() => undefined);
    await repository.addEvent({
      visitId: jobData.visitId,
      jobId: job?.id,
      event: "ANALYZE_VISIT_FAILED",
      level: "error",
      traceId: jobData.traceId,
      metadata: {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      createdAt: nowIso(),
    });
    throw error;
  }
}

function selectPrimaryImage(visit: Visit) {
  const image = visit.images[0];
  if (!image.localPath && !image.url) {
    throw new Error(`Primary image has neither localPath nor url for visit ${visit.id}`);
  }
  return image;
}

function toAIResult(visit: Visit, analysis: AnalyzeShelfResponse): AIResultRecord {
  return {
    visitId: visit.id,
    analysisSource: analysis.yolo.analysisSource,
    detectorModel: analysis.yolo.modelName,
    detectorVersion: analysis.yolo.modelVersion,
    complianceScore: analysis.compliance.score,
    status: analysis.compliance.status,
    supervisorSummary: analysis.supervisorSummary,
    yoloDetections: analysis.yolo.detections,
    detectedProducts: {
      olympicCount: analysis.yolo.counts.olympic,
      visibilityRatio: analysis.yolo.metrics.visibilityRatio,
    },
    competitors: {
      competitorCount: analysis.yolo.counts.competitor,
      competitorAreaRatio: analysis.yolo.metrics.competitorAreaRatio,
    },
    posm: analysis.llm?.posm ?? null,
    overlayImageUrl: analysis.yolo.overlayImageUrl ?? null,
    rawModelOutput: analysis,
    createdAt: nowIso(),
  };
}
