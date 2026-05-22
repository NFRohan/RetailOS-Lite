import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { buildAssistantExactContext, fallbackAssistantAnswer, type AssistantAnswer } from "@/lib/assistant";
import { correlationIdFromHeaders } from "@/lib/observability/correlation";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFromHeaders(request.headers, "assistant");
  const started = Date.now();
  const session = await auth();
  if (!session?.user || !["SUPERVISOR", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const exactContext = await buildAssistantExactContext(question);
  const aiServiceUrl = (process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
  const apiKey = process.env.RETAILOS_AI_SERVICE_API_KEY ?? process.env.AI_SERVICE_API_KEY;

  try {
    const response = await fetch(`${aiServiceUrl}/assistant/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        "x-correlation-id": correlationId,
        "x-request-id": correlationId,
      },
      body: JSON.stringify({
        question,
        exactContext,
        topK: typeof body?.topK === "number" ? body.topK : 5,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      logWarn("assistant service returned fallback", {
        correlationId,
        stage: "assistant",
        status: String(response.status),
        latencyMs: Date.now() - started,
        exactContextCount: exactContext.length,
      });
      return NextResponse.json(
        fallbackAssistantAnswer(question, exactContext, [`AI assistant service failed (${response.status}): ${detail}`]),
      );
    }

    const answer = (await response.json()) as AssistantAnswer;
    logInfo("assistant query completed", {
      correlationId,
      stage: "assistant",
      status: "success",
      latencyMs: Date.now() - started,
      exactContextCount: exactContext.length,
      retrievalMode: answer.retrievalMode,
    });
    metrics.stageLatency.labels("assistant", "success").observe(Date.now() - started);
    const nextResponse = NextResponse.json({
      ...answer,
      exactContextCount: exactContext.length,
    });
    nextResponse.headers.set("x-correlation-id", correlationId);
    return nextResponse;
  } catch (error) {
    logError(error, "assistant query failed", {
      correlationId,
      stage: "assistant",
      status: "error",
      latencyMs: Date.now() - started,
      exactContextCount: exactContext.length,
    });
    metrics.stageLatency.labels("assistant", "error").observe(Date.now() - started);
    Sentry.captureException(error, {
      tags: { stage: "assistant", correlation_id: correlationId },
      extra: { exactContextCount: exactContext.length },
    });
    return NextResponse.json(
      fallbackAssistantAnswer(question, exactContext, [
        error instanceof Error ? error.message : "AI assistant service unavailable",
      ]),
    );
  }
}
