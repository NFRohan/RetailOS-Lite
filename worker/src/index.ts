import { config } from "./config.js";
import { createAnalyzeVisitRuntime } from "./queue.js";

const runtime = createAnalyzeVisitRuntime();
const { worker, events } = runtime;

worker.on("completed", (job) => {
  const summary = job.returnvalue?.outcomeSummary;
  console.log(
    JSON.stringify({
      event: "job_completed",
      jobId: job.id,
      name: job.name,
      visitId: job.data.visitId,
      complianceScore: summary?.complianceScore,
      finalStatus: summary?.finalStatus,
      supervisorSummary: summary?.supervisorSummary,
      complianceReasons: summary?.complianceReasons,
      fraudSignals: summary?.fraudSignals,
    }),
  );
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      event: "job_failed",
      jobId: job?.id,
      name: job?.name,
      error: error.message,
    }),
  );
});

events.on("waiting", ({ jobId }) => {
  console.log(JSON.stringify({ event: "job_waiting", jobId }));
});

console.log(
  JSON.stringify({
    event: "worker_started",
    queue: worker.name,
    concurrency: config.workerConcurrency,
    aiServiceUrl: config.aiServiceUrl,
  }),
);

const shutdown = async () => {
  console.log(JSON.stringify({ event: "worker_shutdown_started" }));
  await runtime.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
