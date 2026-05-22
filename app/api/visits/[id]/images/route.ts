import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: visitId } = await params;
  const visit = await prisma.visit.findUnique({ where: { id: visitId } });
  if (!visit || visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingImage = await prisma.visitImage.findFirst({
    where: { visitId },
    select: { id: true },
  });
  if (existingImage) {
    return NextResponse.json({ error: "Only one shelf image is allowed per visit." }, { status: 409 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const imageHash = formData.get("imageHash") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(file.name) || ".jpg";
  const filename = `${visitId}-${Date.now()}${ext}`;
  const localPath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(localPath, buffer);

  const image = await prisma.visitImage.create({
    data: {
      visitId,
      url: `/uploads/${filename}`,
      localPath,
      imageHash: imageHash ?? undefined,
      metadata: { sizeBytes: buffer.length, contentType: file.type },
    },
  });

  return NextResponse.json(image, { status: 201 });
}
