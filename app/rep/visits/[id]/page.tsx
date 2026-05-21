"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnalyzingPipeline } from "@/components/analyzing-pipeline";
import { VisitResultsPanel } from "@/components/visit-results-panel";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitDetail } from "@/lib/types";
import { TERMINAL_STATUSES } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function RepVisitDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [pipelineStep, setPipelineStep] = useState(0);

  const { data: visit, isLoading } = useQuery<VisitDetail>({
    queryKey: ["visit", id],
    queryFn: () => fetch(`/api/visits/${id}`).then((r) => r.json()),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_STATUSES.includes(status)) return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (visit?.status !== "ANALYZING") return;
    const interval = setInterval(() => {
      setPipelineStep((s) => (s < 4 ? s + 1 : s));
    }, 2500);
    return () => clearInterval(interval);
  }, [visit?.status]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!visit) {
    return <p className="text-destructive">Visit not found</p>;
  }

  const outcome = visit.aiResult?.outcomeSummary ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{visit.outlet.name}</h1>
        <p className="text-sm text-muted-foreground">{formatDate(visit.createdAt)}</p>
        <div className="mt-2">
          <VisitStatusBadge status={visit.status} />
        </div>
      </div>

      {visit.status === "ANALYZING" && <AnalyzingPipeline activeStep={pipelineStep} />}

      {visit.status === "COMPLETE" && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700">Analysis complete</p>
          </CardContent>
        </Card>
      )}

      {visit.status === "FLAGGED" && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            <p className="text-sm font-medium text-rose-700">Visit flagged — review required</p>
          </CardContent>
        </Card>
      )}

      {visit.status === "FAILED" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">Analysis failed. Contact your supervisor.</p>
          </CardContent>
        </Card>
      )}

      {(visit.status === "COMPLETE" || visit.status === "FLAGGED") && (
        <VisitResultsPanel visit={visit} outcome={outcome} />
      )}
    </div>
  );
}
