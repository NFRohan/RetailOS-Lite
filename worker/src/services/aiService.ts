import { z } from "zod";
import type { AnalyzeShelfRequest, AnalyzeShelfResponse } from "../types/ai.js";

const analyzeShelfResponseSchema = z.object({
  visitId: z.string().nullable().optional(),
  yolo: z.object({
    modelName: z.string(),
    modelVersion: z.string(),
    analysisSource: z.string(),
    counts: z.object({
      olympic: z.number(),
      competitor: z.number(),
      total: z.number(),
    }),
    metrics: z.object({
      countRatio: z.number(),
      visibilityRatio: z.number(),
      olympicAreaRatio: z.number(),
      competitorAreaRatio: z.number(),
    }),
    detections: z.array(z.unknown()),
    overlayImageUrl: z.string().nullable().optional(),
  }),
  llm: z.unknown().nullable(),
  compliance: z.object({
    score: z.number(),
    status: z.string(),
    reasons: z.array(z.string()),
    recommendedAction: z.string(),
  }),
  supervisorSummary: z.string(),
});

export class AIServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async analyzeShelf(request: AnalyzeShelfRequest): Promise<AnalyzeShelfResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/analyze-shelf`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI service failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    analyzeShelfResponseSchema.parse(json);
    return json as AnalyzeShelfResponse;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };
  }
}
