import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const pendingStatuses = ["PENDING_REVIEW", "NEW_OUTLET"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submissions = await prisma.outletSubmission.findMany({
    where: {
      status: { in: [...pendingStatuses] },
    },
    include: {
      rep: { select: { id: true, name: true, email: true } },
      matchedOutlet: true,
      createdOutlet: { include: { _count: { select: { visits: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const submissionOutletIds = submissions.map((submission) => submission.createdOutletId).filter(Boolean) as string[];
  const orphanedOutlets = await prisma.outlet.findMany({
    where: {
      verificationStatus: "UNVERIFIED",
      id: { notIn: submissionOutletIds.length > 0 ? submissionOutletIds : ["__none__"] },
    },
    include: { _count: { select: { visits: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    submissions: submissions.map((submission) => ({
      ...submission,
      possibleMatches: parsePossibleMatches(submission.possibleMatches),
    })),
    orphanedOutlets,
  });
}

function parsePossibleMatches(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}
