import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { approveOutlet, OutletResolutionError } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const outlet = await approveOutlet({
      outletId: id,
      supervisorId: session.user.id,
      submissionId: typeof body.submissionId === "string" ? body.submissionId : null,
    });

    await prisma.eventLog.create({
      data: {
        event: "OUTLET_APPROVED",
        level: "info",
        metadata: { outletId: outlet.id, supervisorId: session.user.id, submissionId: body.submissionId ?? null },
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
