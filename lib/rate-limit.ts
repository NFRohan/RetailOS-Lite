import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type BucketState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, BucketState>();

export function rateLimit(request: NextRequest, options: RateLimitOptions): NextResponse | null {
  if (isDisabled()) return null;

  const now = Date.now();
  const identity = clientIdentity(request);
  const key = `${options.bucket}:${identity}`;
  const current = buckets.get(key);
  const state =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + options.windowMs,
        };

  state.count += 1;
  buckets.set(key, state);
  pruneExpiredBuckets(now);

  if (state.count <= options.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
  return NextResponse.json(
    {
      error: "Too many requests. Please retry shortly.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(state.resetAt / 1000)),
      },
    },
  );
}

function clientIdentity(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "local"
  );
}

function isDisabled(): boolean {
  return process.env.API_RATE_LIMIT_ENABLED?.toLowerCase() === "false";
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, state] of buckets.entries()) {
    if (state.resetAt <= now) buckets.delete(key);
  }
}
