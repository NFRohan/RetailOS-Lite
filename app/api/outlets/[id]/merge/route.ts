import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { mergeOutlet, OutletResolutionError } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  if (typeof body.targetOutletId !== "string" || !body.targetOutletId.trim()) {
    return NextResponse.json({ error: "targetOutletId is required." }, { status: 400 });
  }

  try {
    const outlet = await mergeOutlet({
      sourceOutletId: id,
      targetOutletId: body.targetOutletId,
      supervisorId: session.user.id,
      submissionId: typeof body.submissionId === "string" ? body.submissionId : null,
    });

    await prisma.eventLog.create({
      data: {
        event: "OUTLET_MERGED",
        level: "info",
        metadata: {
          sourceOutletId: id,
          targetOutletId: outlet.id,
          supervisorId: session.user.id,
          submissionId: body.submissionId ?? null,
        },
      },
    });

    return NextResponse.json(outlet);
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
