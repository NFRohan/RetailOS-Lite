import pino from "pino";

export type TelemetryFields = {
  correlationId?: string;
  visitId?: string;
  outletId?: string;
  jobId?: string;
  stage?: string;
  latencyMs?: number;
  status?: string;
  [key: string]: unknown;
};

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: process.env.OTEL_SERVICE_NAME || "web",
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "message",
});

export function logInfo(message: string, fields: TelemetryFields = {}) {
  logger.info(cleanFields(fields), message);
}

export function logWarn(message: string, fields: TelemetryFields = {}) {
  logger.warn(cleanFields(fields), message);
}

export function logError(error: unknown, message: string, fields: TelemetryFields = {}) {
  logger.error(
    cleanFields({
      ...fields,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
    message,
  );
}

function cleanFields(fields: TelemetryFields): TelemetryFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}
