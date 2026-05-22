import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildAssistantExactContext, fallbackAssistantAnswer, type AssistantAnswer } from "@/lib/assistant";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        fallbackAssistantAnswer(question, exactContext, [`AI assistant service failed (${response.status}): ${detail}`]),
      );
    }

    const answer = (await response.json()) as AssistantAnswer;
    return NextResponse.json({
      ...answer,
      exactContextCount: exactContext.length,
    });
  } catch (error) {
    return NextResponse.json(
      fallbackAssistantAnswer(question, exactContext, [
        error instanceof Error ? error.message : "AI assistant service unavailable",
      ]),
    );
  }
}
