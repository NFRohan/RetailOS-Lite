import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { OutletResolutionError, searchOutletCandidates } from "@/lib/outlets";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  try {
    const result = await searchOutletCandidates({
      query: body.query ?? body.outletName ?? body.name,
      lat: body.lat ?? body.checkInLat,
      lng: body.lng ?? body.checkInLng,
      radiusMeters: typeof body.radiusMeters === "number" ? body.radiusMeters : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
