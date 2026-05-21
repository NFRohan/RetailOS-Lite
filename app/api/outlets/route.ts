import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outlets = await prisma.outlet.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(outlets);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const outlet = await prisma.outlet.create({
    data: {
      name: body.name,
      code: body.code,
      address: body.address,
      latitude: body.latitude,
      longitude: body.longitude,
    },
  });
  return NextResponse.json(outlet, { status: 201 });
}
