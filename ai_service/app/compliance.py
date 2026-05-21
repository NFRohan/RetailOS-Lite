from .schemas import ComplianceResult, LLMRetailAnalysis, YoloResponse


def status_for_score(score: int) -> str:
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "acceptable"
    if score >= 40:
        return "poor"
    return "critical"


def evaluate_compliance(yolo: YoloResponse, llm: LLMRetailAnalysis | None = None) -> ComplianceResult:
    score = 100
    reasons: list[str] = []

    if yolo.counts.total == 0:
        score -= 75
        reasons.append("No shelf products were detected in the image.")
    elif yolo.counts.olympic == 0:
        score -= 45
        reasons.append("No Olympic products were detected.")

    if yolo.metrics.visibility_ratio < 0.25:
        score -= 25
        reasons.append("Olympic visibility is below the minimum target.")
    elif yolo.metrics.visibility_ratio < 0.5:
        score -= 15
        reasons.append("Olympic visibility is weaker than desired.")

    if yolo.counts.competitor > yolo.counts.olympic and yolo.counts.competitor >= 3:
        score -= 20
        reasons.append("Competitor products dominate visible shelf space.")
    elif yolo.counts.competitor > 0:
        score -= 5
        reasons.append("Competitor products are present.")

    if llm and not llm.posm.detected:
        score -= 15
        reasons.append("POSM was not detected in the shelf image.")
    elif llm and llm.posm.detected:
        reasons.append("POSM appears to be present.")

    if yolo.counts.olympic > 0 and yolo.metrics.visibility_ratio >= 0.5:
        reasons.append("Olympic products have acceptable shelf visibility.")

    score = max(0, min(100, score))
    status = status_for_score(score)

    if status in {"critical", "poor"}:
        recommended_action = "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence."
    elif status == "acceptable":
        recommended_action = "Monitor this outlet and improve Olympic share-of-shelf where possible."
    else:
        recommended_action = "Outlet appears compliant. Continue routine monitoring."

    return ComplianceResult(
        score=score,
        status=status,
        reasons=reasons or ["Shelf appears compliant based on current detection results."],
        recommendedAction=recommended_action,
    )


def build_supervisor_summary(
    yolo: YoloResponse,
    compliance: ComplianceResult,
    llm: LLMRetailAnalysis | None = None,
) -> str:
    if llm and llm.supervisor_summary:
        return llm.supervisor_summary

    if compliance.status in {"critical", "poor"}:
        if yolo.counts.olympic == 0:
            return "Outlet is failing compliance because no Olympic products were detected and competitor presence is high."
        if yolo.counts.competitor > yolo.counts.olympic:
            return "Outlet has weak Olympic visibility and competitor products dominate the shelf."
        return "Outlet has poor Olympic shelf visibility and needs supervisor review."

    if compliance.status == "acceptable":
        return "Outlet is mostly compliant, but Olympic visibility can still be improved."

    return "Outlet has strong Olympic shelf visibility and appears compliant."
