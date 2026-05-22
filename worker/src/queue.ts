import { Queue, QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { config, validateWorkerConfig } from "./config.js";
import { AIServiceClient } from "./services/aiService.js";
import { analyzeVisit } from "./jobs/analyzeVisit.js";
import { JsonVisitRepository } from "./repositories/jsonRepository.js";
import { PrismaVisitRepository } from "./repositories/prismaRepository.js";
import type { AnalyzeVisitJobData } from "./types/domain.js";
import { logError, logWarn } from "./observability/logger.js";
import { jobsFailed, jobRetries, refreshQueueMetrics } from "./observability/metrics.js";
import { captureWorkerException } from "./observability/sentry.js";

type AnalyzeVisitDeadLetterJobData = {
  failedAt: string;
  originalJobId?: string;
  originalJobName: string;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  payload: AnalyzeVisitJobData;
};

type EmbedVisitReportJobData = {
  visitId: string;
};

async function createRepository() {
  if (config.usePrisma && process.env.DATABASE_URL) {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaVisitRepository(new PrismaClient());
  }
  return new JsonVisitRepository(config.localDbPath);
}

export function createRedisConnection() {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}

export function createAnalyzeVisitQueue(connection = createRedisConnection()) {
  return new Queue<AnalyzeVisitJobData>(config.analyzeVisitQueueName, { connection });
}

export type WorkerRuntime = {
  worker: Worker<AnalyzeVisitJobData>;
  embedWorker: Worker<EmbedVisitReportJobData>;
  events: QueueEvents;
  close: () => Promise<void>;
};

export function createAnalyzeVisitWorker(connection = createRedisConnection()) {
  validateWorkerConfig();
  const aiService = new AIServiceClient(config.aiServiceUrl, config.aiServiceApiKey);
  const analyzeQueue = new Queue<AnalyzeVisitJobData>(config.analyzeVisitQueueName, { connection });
  const embedQueue = new Queue(config.embedVisitReportQueueName, { connection });
  const deadLetterQueue = new Queue<AnalyzeVisitDeadLetterJobData>(config.analyzeVisitDeadLetterQueueName, {
    connection,
  });

  const worker = new Worker<AnalyzeVisitJobData>(
    config.analyzeVisitQueueName,
    async (job) => {
      const repository = await createRepository();
      return analyzeVisit(
        job.data,
        {
          repository,
          aiService,
          enqueueVisitReport: async (visitId) => {
            await embedQueue.add(
              "embed_visit_report",
              { visitId },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
                jobId: `embed-${visitId}`,
                removeOnComplete: 100,
                removeOnFail: 100,
              },
            );
          },
        },
        job,
      );
    },
    {
      connection,
      concurrency: config.workerConcurrency,
    },
  );

  worker.on("failed", (job, error) => {
    jobsFailed.labels(config.analyzeVisitQueueName, "analyze_visit").inc();
    if (job && !isFinalFailure(job)) {
      jobRetries.labels(config.analyzeVisitQueueName).inc();
      logWarn("analyze visit job will retry", {
        correlationId: job.data.traceId,
        visitId: job.data.visitId,
        jobId: job.id,
        stage: "analyze_visit",
        status: "retrying",
        attemptsMade: job.attemptsMade,
        error: error.message,
      });
    }
    if (!job || !isFinalFailure(job)) return;
    void addToDeadLetterQueue(deadLetterQueue, job, error);
  });

  const embedWorker = new Worker<EmbedVisitReportJobData>(
    config.embedVisitReportQueueName,
    async (job) => {
      const repository = await createRepository();
      const report = await repository.getVisitReport(job.data.visitId);
      const correlationId = `embed_${job.data.visitId}`;
      await aiService.indexVisitReport(report, { correlationId, jobId: job.id });
      await repository.addEvent({
        visitId: job.data.visitId,
        jobId: job.id,
        event: "VISIT_REPORT_INDEXED",
        level: "info",
        metadata: {
          queue: job.queueName,
          vectorId: `visit-report:${job.data.visitId}`,
        },
        createdAt: new Date().toISOString(),
      });
    },
    {
      connection,
      concurrency: Math.max(1, Math.min(config.workerConcurrency, 4)),
    },
  );

  embedWorker.on("failed", (job, error) => {
    jobsFailed.labels(config.embedVisitReportQueueName, "embedding").inc();
    logError(error, "visit report index failed", {
      correlationId: job ? `embed_${job.data.visitId}` : undefined,
      visitId: job?.data.visitId,
      jobId: job?.id,
      stage: "embedding",
      status: "error",
    });
    captureWorkerException(error, {
      correlationId: job ? `embed_${job.data.visitId}` : undefined,
      visitId: job?.data.visitId,
      jobId: job?.id,
      stage: "embedding",
    });
  });

  setInterval(() => {
    void refreshQueueMetrics([analyzeQueue, embedQueue]).catch((error) => {
      logError(error, "queue metrics refresh failed", { stage: "queue", status: "error" });
    });
  }, 5000).unref();

  return { worker, embedWorker, analyzeQueue, embedQueue, deadLetterQueue };
}

export function createAnalyzeVisitQueueEvents(connection = createRedisConnection()) {
  return new QueueEvents(config.analyzeVisitQueueName, { connection });
}

export function createAnalyzeVisitRuntime(): WorkerRuntime {
  validateWorkerConfig();
  const workerConnection = createRedisConnection();
  const eventsConnection = createRedisConnection();
  const { worker, embedWorker, analyzeQueue, embedQueue, deadLetterQueue } = createAnalyzeVisitWorker(workerConnection);
  const events = createAnalyzeVisitQueueEvents(eventsConnection);

  return {
    worker,
    embedWorker,
    events,
    close: async () => {
      await Promise.all([
        worker.close(),
        embedWorker.close(),
        events.close(),
        analyzeQueue.close(),
        embedQueue.close(),
        deadLetterQueue.close(),
      ]);
      await Promise.all([workerConnection.quit(), eventsConnection.quit()]);
    },
  };
}

function isFinalFailure(job: { attemptsMade: number; opts: { attempts?: number } }): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

async function addToDeadLetterQueue(
  deadLetterQueue: Queue<AnalyzeVisitDeadLetterJobData>,
  job: {
    id?: string;
    name: string;
    attemptsMade: number;
    failedReason?: string;
    stacktrace?: string[] | null;
    data: AnalyzeVisitJobData;
  },
  error: Error,
): Promise<void> {
  try {
    await deadLetterQueue.add(
      "analyze_visit_failed",
      {
        failedAt: new Date().toISOString(),
        originalJobId: job.id,
        originalJobName: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason || error.message,
        stacktrace: job.stacktrace ?? undefined,
        payload: job.data,
      },
      {
        jobId: `dlq-${job.id ?? job.data.visitId}-${Date.now()}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    logWarn("analyze visit moved to dead letter queue", {
      correlationId: job.data.traceId,
      visitId: job.data.visitId,
      jobId: job.id,
      stage: "analyze_visit",
      status: "dead_lettered",
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || error.message,
    });
  } catch (dlqError) {
    logError(dlqError, "dead letter enqueue failed", {
      correlationId: job.data.traceId,
      jobId: job.id,
      visitId: job.data.visitId,
      stage: "analyze_visit",
      status: "error",
    });
    captureWorkerException(dlqError, {
      correlationId: job.data.traceId,
      jobId: job.id,
      visitId: job.data.visitId,
      stage: "analyze_visit",
    });
  }
}
