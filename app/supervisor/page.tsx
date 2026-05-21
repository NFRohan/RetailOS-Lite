"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { VisitTable } from "@/components/visit-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { DashboardData, VisitListItem } from "@/lib/types";
import { Activity, AlertTriangle, Store, TrendingDown } from "lucide-react";
import Link from "next/link";

export default function SupervisorDashboardPage() {
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const visits = (data?.visits ?? []).filter((v) => !flaggedOnly || v.status === "FLAGGED");

  const kpis = [
    { label: "Visits today", value: data?.visitsToday ?? 0, icon: Activity, color: "text-gold" },
    { label: "Avg compliance", value: `${data?.avgComplianceScore ?? 0}%`, icon: TrendingDown, color: "text-emerald-400" },
    { label: "Flagged visits", value: data?.flaggedCount ?? 0, icon: AlertTriangle, color: "text-rose-400" },
    { label: "Outlets below 60", value: data?.outletsBelowThreshold ?? 0, icon: Store, color: "text-amber-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Supervisor dashboard</h1>
          <p className="text-sm text-white/50">AI shelf analysis & compliance overview</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="rounded border-white/20"
          />
          Flagged only
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-white/60">{kpi.label}</CardTitle>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums text-white">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">All visits</h2>
          <VisitTable visits={visits} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Needs attention</h2>
          <Card className="border-white/10 bg-white/5">
            <CardContent className="space-y-3 p-4">
              {(data?.needsAttention ?? []).length === 0 ? (
                <p className="text-sm text-white/50">No compliance data yet</p>
              ) : (
                (data?.needsAttention ?? []).map((visit: VisitListItem) => (
                  <Link
                    key={visit.id}
                    href={`/supervisor/visits/${visit.id}`}
                    className="block rounded-lg border border-white/10 p-3 transition-colors hover:border-gold/30 hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{visit.outletName}</span>
                      <Badge variant="critical">{visit.complianceScore}%</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/50">{visit.supervisorSummary}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
