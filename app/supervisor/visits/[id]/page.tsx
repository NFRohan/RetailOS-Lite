"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { VisitResultsPanel } from "@/components/visit-results-panel";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default function SupervisorVisitDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: visit, isLoading } = useQuery<VisitDetail>({
    queryKey: ["visit", id],
    queryFn: () => fetch(`/api/visits/${id}`).then((r) => r.json()),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (!visit) {
    return <p className="text-rose-400">Visit not found</p>;
  }

  const outcome = visit.aiResult?.outcomeSummary ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
        <Link href="/supervisor">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{visit.outlet.name}</h1>
          <p className="text-sm text-white/50">
            {visit.outlet.code} · {visit.rep.name} · {formatDate(visit.createdAt)}
          </p>
        </div>
        <VisitStatusBadge status={visit.status} />
      </div>

      {visit.aiResult ? (
        <VisitResultsPanel visit={visit} outcome={outcome} />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/50">
          {visit.status === "ANALYZING" ? "AI analysis in progress…" : "No analysis results yet"}
        </div>
      )}
    </div>
  );
}
