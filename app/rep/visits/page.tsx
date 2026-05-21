"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { ComplianceBadge } from "@/components/compliance-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ChevronRight, ClipboardList } from "lucide-react";

export default function RepVisitsPage() {
  const { data: visits, isLoading } = useQuery<VisitListItem[]>({
    queryKey: ["visits"],
    queryFn: () => fetch("/api/visits").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!visits?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-white py-16 text-center">
        <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No visits yet</h2>
        <p className="mb-4 text-sm text-muted-foreground">Start your first outlet check-in</p>
        <Button asChild>
          <Link href="/rep/visits/new">New visit</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My visits</h1>
      <div className="space-y-3">
        {visits.map((visit) => (
          <Link
            key={visit.id}
            href={`/rep/visits/${visit.id}`}
            className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="space-y-1">
              <p className="font-semibold">{visit.outletName}</p>
              <p className="text-xs text-muted-foreground">{formatDate(visit.createdAt)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <VisitStatusBadge status={visit.status} />
                {visit.complianceScore !== null && (
                  <ComplianceBadge score={visit.complianceScore} status={visit.complianceStatus} />
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
