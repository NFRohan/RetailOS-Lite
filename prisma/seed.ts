import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo123", 10);

  const rep = await prisma.user.upsert({
    where: { email: "rep@demo.com" },
    update: {},
    create: {
      email: "rep@demo.com",
      name: "Ayesha Rahman",
      passwordHash,
      role: "REP",
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@demo.com" },
    update: {},
    create: {
      email: "supervisor@demo.com",
      name: "Karim Supervisor",
      passwordHash,
      role: "SUPERVISOR",
    },
  });

  const outlets = await Promise.all([
    prisma.outlet.upsert({
      where: { code: "OUT-1024" },
      update: {},
      create: {
        name: "Rahim Store",
        code: "OUT-1024",
        address: "Dhanmondi, Dhaka",
        latitude: 23.7809,
        longitude: 90.2791,
      },
    }),
    prisma.outlet.upsert({
      where: { code: "OUT-2048" },
      update: {},
      create: {
        name: "Maa Enterprise",
        code: "OUT-2048",
        address: "Mirpur, Dhaka",
        latitude: 23.8223,
        longitude: 90.3654,
      },
    }),
    prisma.outlet.upsert({
      where: { code: "OUT-3072" },
      update: {},
      create: {
        name: "City Mart Dhanmondi",
        code: "OUT-3072",
        address: "Road 27, Dhanmondi",
        latitude: 23.7518,
        longitude: 90.3745,
      },
    }),
  ]);

  const sampleOutcome = {
    visitId: "",
    outletName: "Maa Enterprise",
    finalStatus: "FLAGGED",
    complianceScore: 38,
    complianceStatus: "critical",
    complianceReasons: [
      "No Olympic products were detected.",
      "Competitor products dominate visible shelf space.",
      "POSM was not detected in the shelf image.",
    ],
    supervisorSummary: "Outlet has poor Olympic visibility and missing POSM. Competitor presence is strong.",
    recommendedAction: "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence.",
    counts: { olympic: 1, competitor: 18, total: 19 },
    visibilityRatio: 0.05,
    posm: {
      detected: false,
      evidence: "No clearly Olympic-branded POSM is visible.",
      missingReason: "Olympic-branded signage is not visible.",
    },
    fraudSignals: [{ type: "GPS_MISMATCH", severity: "HIGH", message: "Check-in GPS is far from outlet location." }],
  };

  for (const [i, outlet] of outlets.entries()) {
    const existing = await prisma.visit.findFirst({
      where: { outletId: outlet.id, repId: rep.id, status: "FLAGGED" },
    });
    if (existing) continue;

    const visit = await prisma.visit.create({
      data: {
        outletId: outlet.id,
        repId: rep.id,
        status: i === 0 ? "COMPLETE" : "FLAGGED",
        checkInLat: outlet.latitude,
        checkInLng: outlet.longitude,
        notes: "Demo seeded visit",
        clientTimestamp: new Date(Date.now() - i * 86400000),
      },
    });

    await prisma.visitImage.create({
      data: {
        visitId: visit.id,
        url: "/demo/placeholder-shelf.svg",
        localPath: path.join(process.cwd(), "public", "demo", "placeholder-shelf.svg"),
      },
    });

    const score = i === 0 ? 72 : i === 1 ? 38 : 55;
    const status = score >= 60 ? "acceptable" : "critical";
    const outcome = {
      ...sampleOutcome,
      visitId: visit.id,
      outletName: outlet.name,
      complianceScore: score,
      complianceStatus: status,
      finalStatus: i === 0 ? "COMPLETE" : "FLAGGED",
    };

    await prisma.aIResult.create({
      data: {
        visitId: visit.id,
        analysisSource: "YOLO",
        detectorModel: "retail-shelf-yolo",
        detectorVersion: "v1",
        complianceScore: score,
        status,
        supervisorSummary: outcome.supervisorSummary,
        detectedProducts: { olympicCount: outcome.counts.olympic },
        competitors: { competitorCount: outcome.counts.competitor },
        posm: outcome.posm,
        outcomeSummary: outcome,
        rawModelOutput: {},
      },
    });

    if (i > 0) {
      await prisma.fraudSignal.create({
        data: {
          visitId: visit.id,
          type: "GPS_MISMATCH",
          severity: "HIGH",
          message: "Check-in GPS is far from outlet location.",
        },
      });
    }
  }

  console.log("Seeded:", { rep: rep.email, supervisor: supervisor.email, outlets: outlets.length });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
