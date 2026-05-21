import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { FraudSignal, Visit, VisitImage } from "../types/domain.js";
import type { VisitRepository } from "../repositories/visitRepository.js";

const nowIso = () => new Date().toISOString();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export async function runContextualFraudChecks(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];

  signals.push(...(await hashAndDuplicateSignals(visit, repository)));
  const gpsSignal = gpsMismatchSignal(visit);
  if (gpsSignal) signals.push(gpsSignal);
  const timestampSignal = timestampAnomalySignal(visit);
  if (timestampSignal) signals.push(timestampSignal);

  return signals;
}

async function hashAndDuplicateSignals(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];

  for (const image of visit.images) {
    if (!image.imageHash && image.localPath) {
      const imageHash = await sha256ForLocalPath(image.localPath);
      const updatedImage: VisitImage = { ...image, imageHash };
      await repository.updateVisitImage(updatedImage);
      image.imageHash = imageHash;
      signals.push({
        visitId: visit.id,
        type: "IMAGE_HASHED",
        severity: "LOW",
        message: "Image SHA-256 hash computed for duplicate detection.",
        metadata: { imageId: image.id, imageHash },
        createdAt: nowIso(),
      });
    }

    if (image.imageHash) {
      const duplicates = await repository.findImagesByHash(image.imageHash, visit.id);
      if (duplicates.length > 0) {
        signals.push({
          visitId: visit.id,
          type: "DUPLICATE_IMAGE",
          severity: "HIGH",
          message: "Image appears to be reused from another visit.",
          metadata: {
            imageId: image.id,
            imageHash: image.imageHash,
            duplicateImageIds: duplicates.map((duplicate) => duplicate.id),
          },
          createdAt: nowIso(),
        });
      }
    }
  }

  return signals;
}

async function sha256ForLocalPath(localPath: string): Promise<string> {
  const resolved = path.isAbsolute(localPath) ? localPath : path.join(rootDir, localPath);
  const buffer = await fs.readFile(resolved);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function gpsMismatchSignal(visit: Visit): FraudSignal | null {
  const { latitude, longitude } = visit.outlet;
  if (
    latitude === undefined ||
    longitude === undefined ||
    visit.checkInLat === undefined ||
    visit.checkInLng === undefined
  ) {
    return null;
  }

  const distanceMeters = haversineMeters(latitude, longitude, visit.checkInLat, visit.checkInLng);
  if (distanceMeters <= config.fraudGpsThresholdMeters) return null;

  return {
    visitId: visit.id,
    type: "GPS_MISMATCH",
    severity: distanceMeters > config.fraudGpsThresholdMeters * 3 ? "HIGH" : "MEDIUM",
    message: "Rep check-in location is far from the outlet location.",
    metadata: {
      distanceMeters: Math.round(distanceMeters),
      thresholdMeters: config.fraudGpsThresholdMeters,
      outletLat: latitude,
      outletLng: longitude,
      checkInLat: visit.checkInLat,
      checkInLng: visit.checkInLng,
    },
    createdAt: nowIso(),
  };
}

function timestampAnomalySignal(visit: Visit): FraudSignal | null {
  if (!visit.clientTimestamp || !visit.serverCreatedAt) return null;

  const clientTime = new Date(visit.clientTimestamp).getTime();
  const serverTime = new Date(visit.serverCreatedAt).getTime();
  if (!Number.isFinite(clientTime) || !Number.isFinite(serverTime)) return null;

  const delayHours = (serverTime - clientTime) / (1000 * 60 * 60);
  if (clientTime > serverTime + 5 * 60 * 1000) {
    return {
      visitId: visit.id,
      type: "TIMESTAMP_ANOMALY",
      severity: "MEDIUM",
      message: "Client timestamp is in the future compared with server receipt time.",
      metadata: { clientTimestamp: visit.clientTimestamp, serverCreatedAt: visit.serverCreatedAt },
      createdAt: nowIso(),
    };
  }

  if (delayHours <= config.fraudTimestampDelayHours) return null;

  return {
    visitId: visit.id,
    type: "TIMESTAMP_ANOMALY",
    severity: delayHours > config.fraudTimestampDelayHours * 2 ? "HIGH" : "MEDIUM",
    message: "Visit was synced significantly after the client capture time.",
    metadata: {
      clientTimestamp: visit.clientTimestamp,
      serverCreatedAt: visit.serverCreatedAt,
      delayHours: Number(delayHours.toFixed(2)),
      thresholdHours: config.fraudTimestampDelayHours,
    },
    createdAt: nowIso(),
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

