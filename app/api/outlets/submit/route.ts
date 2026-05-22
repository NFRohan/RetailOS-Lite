import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { OutletResolutionError, submitOutletSelection } from "@/lib/outlets";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  try {
    const resolution = await submitOutletSelection({
      repId: session.user.id,
      submittedName: body.submittedName ?? body.outletName ?? body.name,
      submittedLat: body.submittedLat ?? body.checkInLat ?? body.lat,
      submittedLng: body.submittedLng ?? body.checkInLng ?? body.lng,
      selectedOutletId: body.selectedOutletId ?? body.outletId,
      forceNewOutlet: Boolean(body.forceNewOutlet),
    });

    return NextResponse.json({
      outlet: resolution.outlet,
      outletSubmission: resolution.outletSubmission,
      created: resolution.created,
      matchedBy: resolution.matchedBy,
    });
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
