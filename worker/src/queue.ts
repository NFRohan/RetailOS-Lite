import { Queue, QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { config, validateWorkerConfig } from "./config.js";
import { AIServiceClient } from "./services/aiService.js";
import { analyzeVisit } from "./jobs/analyzeVisit.js";
import { JsonVisitRepository } from "./repositories/jsonRepository.js";
import type { AnalyzeVisitJobData } from "./types/domain.js";

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
  events: QueueEvents;
  close: () => Promise<void>;
};

export function createAnalyzeVisitWorker(connection = createRedisConnection()) {
  validateWorkerConfig();
  const repository = new JsonVisitRepository(config.localDbPath);
  const aiService = new AIServiceClient(config.aiServiceUrl);
  const embedQueue = new Queue(config.embedVisitReportQueueName, { connection });

  const worker = new Worker<AnalyzeVisitJobData>(
    config.analyzeVisitQueueName,
    async (job) =>
      analyzeVisit(
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
      ),
    {
      connection,
      concurrency: config.workerConcurrency,
    },
  );

  return { worker, embedQueue };
}

export function createAnalyzeVisitQueueEvents(connection = createRedisConnection()) {
  return new QueueEvents(config.analyzeVisitQueueName, { connection });
}

export function createAnalyzeVisitRuntime(): WorkerRuntime {
  validateWorkerConfig();
  const workerConnection = createRedisConnection();
  const eventsConnection = createRedisConnection();
  const { worker, embedQueue } = createAnalyzeVisitWorker(workerConnection);
  const events = createAnalyzeVisitQueueEvents(eventsConnection);

  return {
    worker,
    events,
    close: async () => {
      await Promise.all([worker.close(), events.close(), embedQueue.close()]);
      await Promise.all([workerConnection.quit(), eventsConnection.quit()]);
    },
  };
}
