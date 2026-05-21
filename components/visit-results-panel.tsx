import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplianceRing } from "@/components/compliance-ring";
import { FraudSignalsPanel } from "@/components/fraud-signals-panel";
import { ImageCompareSlider } from "@/components/image-compare-slider";
import { OlympicCompetitorChart } from "@/components/olympic-competitor-chart";
import { SupervisorSummaryCard } from "@/components/supervisor-summary-card";
import type { OutcomeSummary, VisitDetail } from "@/lib/types";
import { ListChecks, Target } from "lucide-react";

type Props = {
  visit: VisitDetail;
  outcome: OutcomeSummary | null;
};

export function VisitResultsPanel({ visit, outcome }: Props) {
  if (!outcome && !visit.aiResult) return null;

  const score = outcome?.complianceScore ?? visit.aiResult?.complianceScore ?? 0;
  const status = outcome?.complianceStatus ?? visit.aiResult?.status ?? "unknown";
  const summary = outcome?.supervisorSummary ?? visit.aiResult?.supervisorSummary ?? "";
  const rawUrl = visit.images[0]?.url ?? "";
  const overlayUrl = visit.aiResult?.overlayImageUrl;
  const counts = outcome?.counts ?? { olympic: 0, competitor: 0, total: 0 };
  const fraudSignals =
    outcome?.fraudSignals ??
    visit.fraudSignals.map((s) => ({ type: s.type, severity: s.severity, message: s.message }));

  return (
    <div className="space-y-6">
      <SupervisorSummaryCard summary={summary} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shelf imagery</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageCompareSlider rawUrl={rawUrl} overlayUrl={overlayUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <ComplianceRing score={score} status={status} />
            <OlympicCompetitorChart olympic={counts.olympic} competitor={counts.competitor} />
          </CardContent>
        </Card>
      </div>

      {outcome?.complianceReasons && outcome.complianceReasons.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ListChecks className="h-4 w-4 text-gold" />
            <CardTitle className="text-base">Compliance reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {outcome.complianceReasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {outcome?.recommendedAction && (
        <Card className="border-gold/20">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Target className="h-4 w-4 text-gold" />
            <CardTitle className="text-base">Recommended action</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/90">{outcome.recommendedAction}</p>
          </CardContent>
        </Card>
      )}

      {outcome?.posm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">POSM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={outcome.posm.detected ? "success" : "critical"}>
              {outcome.posm.detected ? "POSM detected" : "POSM missing"}
            </Badge>
            <p className="text-sm text-muted-foreground">{outcome.posm.evidence}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fraud signals</CardTitle>
        </CardHeader>
        <CardContent>
          <FraudSignalsPanel signals={fraudSignals} />
        </CardContent>
      </Card>
    </div>
  );
}
