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
          <Skeleton key={i} className="h-28 w-full rounded-3xl bg-white" />
        ))}
      </div>
    );
  }

  if (!visits?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#b9c4d8] bg-white px-6 py-16 text-center shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2fb] text-teal">
          <ClipboardList className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-navy">No visits yet</h2>
        <p className="mb-4 text-sm text-muted-foreground">Start your first outlet check-in</p>
        <Button className="rounded-full" asChild>
          <Link href="/rep/visits/new">New Visit</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Field Activity</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy">My Visits</h1>
          <p className="text-sm text-muted-foreground">{visits.length} submitted visit(s)</p>
        </div>
        <Button className="rounded-full" asChild>
          <Link href="/rep/visits/new">New</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {visits.map((visit) => (
          <Link
            key={visit.id}
            href={`/rep/visits/${visit.id}`}
            className="flex items-center justify-between rounded-3xl border border-[#d6ddea] bg-white p-4 shadow-[0_8px_28px_rgba(2,43,58,0.06)] transition-shadow hover:shadow-md"
          >
            <div className="space-y-1">
              <p className="font-bold text-navy">{visit.outletName}</p>
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
