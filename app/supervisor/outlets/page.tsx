"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, ExternalLink, Loader2, MapPin, Store, X } from "lucide-react";

type OutletVerificationItem = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "REJECTED";
  createdByVisitId: string | null;
  createdAt: string;
  _count?: {
    visits: number;
  };
};

type VerificationAction = {
  outletId: string;
  status: "VERIFIED" | "REJECTED";
};

export default function OutletVerificationPage() {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: outlets = [], isLoading } = useQuery<OutletVerificationItem[]>({
    queryKey: ["outlets", "UNVERIFIED"],
    queryFn: async () => {
      const response = await fetch("/api/outlets?status=UNVERIFIED");
      if (!response.ok) throw new Error("Could not load unverified outlets.");
      return response.json();
    },
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: async ({ outletId, status }: VerificationAction) => {
      setError("");
      setActiveAction(`${outletId}:${status}`);
      const response = await fetch(`/api/outlets/${outletId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not update outlet verification.");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["outlets", "UNVERIFIED"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not update outlet verification.");
    },
    onSettled: () => {
      setActiveAction(null);
    },
  });

  const linkedVisits = outlets.filter((outlet) => outlet.createdByVisitId).length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Outlet Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review shops discovered by reps before treating them as official outlet records.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <VerificationStat icon={Store} label="Pending Shops" value={outlets.length} helper="Awaiting supervisor review" />
        <VerificationStat icon={ExternalLink} label="Visit Linked" value={linkedVisits} helper="Created from submitted visits" />
        <VerificationStat icon={MapPin} label="Matching Rule" value="75m" helper="Same name must be nearby to auto-reuse" />
      </section>

      <Card className="overflow-hidden border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader className="border-b bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl text-navy">Unverified Outlet Queue</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Verify real stores, reject obvious duplicates or bad entries, and inspect the source visit when needed.
              </p>
            </div>
            <Badge variant="warning" className="w-fit">
              {outlets.length} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p className="m-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {isLoading ? <OutletQueueSkeleton /> : <OutletQueue outlets={outlets} activeAction={activeAction} onAction={mutation.mutate} />}
        </CardContent>
      </Card>
    </div>
  );
}

function VerificationStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Card className="min-h-[124px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-navy">{value}</span>
          <span className="text-sm text-muted-foreground">{helper}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OutletQueue({
  outlets,
  activeAction,
  onAction,
}: {
  outlets: OutletVerificationItem[];
  activeAction: string | null;
  onAction: (action: VerificationAction) => void;
}) {
  if (outlets.length === 0) {
    return (
      <div className="p-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-3 font-semibold text-navy">No outlet reviews pending.</p>
        <p className="mt-1 text-sm text-muted-foreground">New rep-created shops will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-navy/5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Shop</th>
            <th className="px-4 py-3">GPS</th>
            <th className="px-4 py-3">Visits</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet) => (
            <tr key={outlet.id} className="border-b last:border-0 hover:bg-teal/5">
              <td className="px-4 py-3">
                <div className="font-semibold text-navy">{outlet.name}</div>
                <div className="text-xs text-muted-foreground">{outlet.code}</div>
                {outlet.address && <div className="mt-1 text-xs text-muted-foreground">{outlet.address}</div>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {outlet.latitude !== null && outlet.longitude !== null
                  ? `${outlet.latitude.toFixed(5)}, ${outlet.longitude.toFixed(5)}`
                  : "No GPS captured"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{outlet._count?.visits ?? 0}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(outlet.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {outlet.createdByVisitId && (
                    <Button variant="outline" size="sm" className="rounded-full bg-white" asChild>
                      <Link href={`/supervisor/visits/${outlet.createdByVisitId}`}>
                        <ExternalLink className="h-4 w-4" />
                        Visit
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                    disabled={Boolean(activeAction)}
                    onClick={() => onAction({ outletId: outlet.id, status: "REJECTED" })}
                  >
                    {activeAction === `${outlet.id}:REJECTED` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-teal text-white hover:bg-teal/90"
                    disabled={Boolean(activeAction)}
                    onClick={() => onAction({ outletId: outlet.id, status: "VERIFIED" })}
                  >
                    {activeAction === `${outlet.id}:VERIFIED` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Verify
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutletQueueSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className="h-16 rounded-xl bg-[#eef2fb]" />
      ))}
    </div>
  );
}
