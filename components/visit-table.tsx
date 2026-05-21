"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ComplianceBadge } from "@/components/compliance-badge";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import type { VisitListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

type Props = {
  visits: VisitListItem[];
  basePath?: string;
};

export function VisitTable({ visits, basePath = "/supervisor/visits" }: Props) {
  if (visits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        No visits yet. Create a visit as a rep to see results here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Outlet</th>
            <th className="px-4 py-3 font-medium">Rep</th>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit, i) => (
            <motion.tr
              key={visit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="border-b last:border-0 hover:bg-muted/20"
            >
              <td className="px-4 py-3">
                <Link href={`${basePath}/${visit.id}`} className="font-medium hover:text-gold">
                  {visit.outletName}
                </Link>
                <div className="text-xs text-muted-foreground">{visit.outletCode}</div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{visit.repName}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(visit.createdAt)}</td>
              <td className="px-4 py-3">
                <ComplianceBadge score={visit.complianceScore} status={visit.complianceStatus} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <VisitStatusBadge status={visit.status} />
                  {visit.hasHighFraud && <AlertTriangle className="h-4 w-4 text-rose-400" />}
                </div>
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                {visit.supervisorSummary ?? "—"}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
