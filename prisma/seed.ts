import { PrismaClient } from "@prisma/client";
import path from "node:path";
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
    const clientVisitId = `seed-${outlet.code}`;
    const visitStatus = i === 0 ? "COMPLETE" : "FLAGGED";
    const visit = await prisma.visit.upsert({
      where: { clientVisitId },
      update: {
        outletId: outlet.id,
        repId: rep.id,
        status: visitStatus,
        checkInLat: outlet.latitude,
        checkInLng: outlet.longitude,
        notes: "Demo seeded visit",
        clientTimestamp: new Date(Date.now() - i * 86400000),
      },
      create: {
        clientVisitId,
        outletId: outlet.id,
        repId: rep.id,
        status: visitStatus,
        checkInLat: outlet.latitude,
        checkInLng: outlet.longitude,
        notes: "Demo seeded visit",
        clientTimestamp: new Date(Date.now() - i * 86400000),
      },
    });

    const existingImage = await prisma.visitImage.findFirst({
      where: { visitId: visit.id, url: "/demo/placeholder-shelf.svg" },
    });
    if (existingImage) {
      await prisma.visitImage.update({
        where: { id: existingImage.id },
        data: {
          localPath: path.join(process.cwd(), "public", "demo", "placeholder-shelf.svg"),
        },
      });
    } else {
      await prisma.visitImage.create({
        data: {
          visitId: visit.id,
          url: "/demo/placeholder-shelf.svg",
          localPath: path.join(process.cwd(), "public", "demo", "placeholder-shelf.svg"),
        },
      });
    }

    const score = i === 0 ? 72 : i === 1 ? 38 : 55;
    const status = score >= 60 ? "acceptable" : "critical";
    const outcome = {
      ...sampleOutcome,
      visitId: visit.id,
      outletName: outlet.name,
      complianceScore: score,
      complianceStatus: status,
      finalStatus: visitStatus,
    };

    await prisma.aIResult.upsert({
      where: { visitId: visit.id },
      create: {
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
      update: {
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
      const existingSignal = await prisma.fraudSignal.findFirst({
        where: {
          visitId: visit.id,
          type: "GPS_MISMATCH",
          message: "Check-in GPS is far from outlet location.",
        },
      });
      if (existingSignal) {
        await prisma.fraudSignal.update({
          where: { id: existingSignal.id },
          data: { severity: "HIGH" },
        });
      } else {
        await prisma.fraudSignal.create({
          data: {
            visitId: visit.id,
            type: "GPS_MISMATCH",
            severity: "HIGH",
            message: "Check-in GPS is far from outlet location.",
          },
        });
      }
    } else {
      await prisma.fraudSignal.deleteMany({
        where: {
          visitId: visit.id,
          type: "GPS_MISMATCH",
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
