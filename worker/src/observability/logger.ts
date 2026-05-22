import pino from "pino";
import { config } from "../config.js";

export type WorkerTelemetryFields = {
  correlationId?: string;
  visitId?: string;
  outletId?: string;
  jobId?: string;
  stage?: string;
  latencyMs?: number;
  status?: string;
  [key: string]: unknown;
};

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "worker",
    environment: config.appEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "message",
});

export function logInfo(message: string, fields: WorkerTelemetryFields = {}) {
  logger.info(clean(fields), message);
}

export function logWarn(message: string, fields: WorkerTelemetryFields = {}) {
  logger.warn(clean(fields), message);
}

export function logError(error: unknown, message: string, fields: WorkerTelemetryFields = {}) {
  logger.error(
    clean({
      ...fields,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
    message,
  );
}

function clean(fields: WorkerTelemetryFields): WorkerTelemetryFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}
