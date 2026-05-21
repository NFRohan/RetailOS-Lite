import { Queue } from "bullmq";
import { Redis } from "ioredis";

export type AnalyzeVisitJobData = {
  visitId: string;
  traceId?: string;
  useLlm?: boolean;
};

function env(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw : fallback;
}

export const queueConfig = {
  redisUrl: env("REDIS_URL", "redis://127.0.0.1:6379"),
  analyzeVisitQueueName: env("ANALYZE_VISIT_QUEUE", "analyze_visit"),
};

let redisConnection: Redis | null = null;
let analyzeQueue: Queue<AnalyzeVisitJobData> | null = null;

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new Redis(queueConfig.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

export function getAnalyzeVisitQueue() {
  if (!analyzeQueue) {
    analyzeQueue = new Queue<AnalyzeVisitJobData>(queueConfig.analyzeVisitQueueName, {
      connection: getRedisConnection(),
    });
  }
  return analyzeQueue;
}

export async function enqueueAnalyzeVisit(visitId: string, useLlm = true) {
  const queue = getAnalyzeVisitQueue();
  const traceId = crypto.randomUUID();
  await queue.add(
    "analyze_visit",
    { visitId, traceId, useLlm },
    {
      jobId: `analyze-${visitId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  return traceId;
}
