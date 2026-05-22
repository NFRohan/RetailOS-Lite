"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ComplianceBadge } from "@/components/compliance-badge";
import { Badge } from "@/components/ui/badge";
import type { VisitListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

type Props = {
  visits: VisitListItem[];
  basePath?: string;
};

export function VisitTable({ visits, basePath = "/supervisor/visits" }: Props) {
  if (visits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-12 text-center text-muted-foreground">
        No visits yet. Create a visit as a rep to see results here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-navy/5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Outlet Name</th>
            <th className="px-4 py-3">Rep Name</th>
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3">AI Compliance</th>
            <th className="px-4 py-3">Review Status</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit, i) => (
            <motion.tr
              key={visit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group border-b last:border-0 hover:bg-teal/5"
            >
              <td className="px-4 py-3">
                <Link href={`${basePath}/${visit.id}`} className="font-semibold text-navy hover:text-teal">
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
                <ReviewStatus visit={visit} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`${basePath}/${visit.id}`}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-teal opacity-100 transition-colors hover:bg-teal/10 md:opacity-0 md:group-hover:opacity-100"
                >
                  Inspect
                </Link>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewStatus({ visit }: { visit: VisitListItem }) {
  const primaryReason = visit.reviewReasons[0];

  if (visit.riskStatus === "HIGH_RISK") {
    return (
      <div className="space-y-1">
        <Badge variant="critical" className="gap-1">
          <ShieldAlert className="h-3.5 w-3.5" />
          High Risk
        </Badge>
        {primaryReason && <p className="max-w-64 text-xs text-muted-foreground">{primaryReason}</p>}
      </div>
    );
  }

  if (visit.riskStatus === "REVIEW_NEEDED" || visit.fraudCount > 0) {
    return (
      <div className="space-y-1">
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          Review Needed
        </Badge>
        <p className="max-w-64 text-xs text-muted-foreground">
          {primaryReason ?? "Supervisor review required"}
          {visit.fraudCount === 0 ? " • No fraud signals" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Clean
      </Badge>
      <p className="max-w-64 text-xs text-muted-foreground">No review reasons</p>
    </div>
  );
}
