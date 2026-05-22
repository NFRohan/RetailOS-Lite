import crypto from "node:crypto";

export const CORRELATION_HEADER = "x-correlation-id";
export const REQUEST_ID_HEADER = "x-request-id";

export function createCorrelationId(prefix = "corr"): string {
  return `${prefix}_${crypto.randomUUID?.() ?? crypto.randomBytes(12).toString("hex")}`;
}

export function correlationIdFromHeaders(headers: Headers, fallbackPrefix = "corr"): string {
  return (
    headers.get(CORRELATION_HEADER) ||
    headers.get(REQUEST_ID_HEADER) ||
    createCorrelationId(fallbackPrefix)
  );
}

export function headersWithCorrelation(
  correlationId: string,
  init?: HeadersInit,
): Record<string, string> {
  const headers = new Headers(init);
  headers.set(CORRELATION_HEADER, correlationId);
  headers.set(REQUEST_ID_HEADER, correlationId);
  return Object.fromEntries(headers.entries());
}
