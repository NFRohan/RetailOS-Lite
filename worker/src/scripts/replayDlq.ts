import { Queue } from "bullmq";
import { config } from "../config.js";
import { createRedisConnection } from "../queue.js";
import type { AnalyzeVisitJobData } from "../types/domain.js";

type DeadLetterJobData = {
  payload?: AnalyzeVisitJobData;
  failedAt?: string;
  failedReason?: string;
  originalJobId?: string;
};

type Args = {
  limit: number;
  dryRun: boolean;
  remove: boolean;
  visitId?: string;
};

const args = parseArgs(process.argv.slice(2));
const connection = createRedisConnection();
const dlq = new Queue<DeadLetterJobData>(config.analyzeVisitDeadLetterQueueName, { connection });
const analyzeQueue = new Queue<AnalyzeVisitJobData>(config.analyzeVisitQueueName, { connection });

async function main() {
  const jobs = await dlq.getJobs(["waiting", "delayed", "failed", "paused"], 0, Math.max(0, args.limit - 1), false);
  const selected = jobs.filter((job) => {
    const payload = job.data.payload;
    return payload && (!args.visitId || payload.visitId === args.visitId);
  });

  console.log(
    JSON.stringify({
      event: "dlq_replay_scan",
      dlq: config.analyzeVisitDeadLetterQueueName,
      targetQueue: config.analyzeVisitQueueName,
      found: jobs.length,
      selected: selected.length,
      dryRun: args.dryRun,
      remove: args.remove,
    }),
  );

  for (const job of selected) {
    const payload = job.data.payload;
    if (!payload) continue;

    const replayJobId = `replay-${payload.visitId}-${Date.now()}`;
    const record = {
      dlqJobId: job.id,
      originalJobId: job.data.originalJobId,
      visitId: payload.visitId,
      failedAt: job.data.failedAt,
      failedReason: job.data.failedReason,
      replayJobId,
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ event: "dlq_replay_dry_run", ...record }));
      continue;
    }

    await analyzeQueue.add("analyze_visit", payload, {
      jobId: replayJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    if (args.remove) {
      await job.remove();
    }

    console.log(JSON.stringify({ event: "dlq_replayed", ...record, removedFromDlq: args.remove }));
  }
}

function parseArgs(raw: string[]): Args {
  const args: Args = {
    limit: 25,
    dryRun: true,
    remove: false,
  };

  for (const arg of raw) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--remove") args.remove = true;
    if (arg.startsWith("--limit=")) args.limit = positiveInt(arg.slice("--limit=".length), args.limit);
    if (arg.startsWith("--visit-id=")) args.visitId = arg.slice("--visit-id=".length).trim() || undefined;
  }

  return args;
}

function positiveInt(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([dlq.close(), analyzeQueue.close()]);
    await connection.quit();
  });
