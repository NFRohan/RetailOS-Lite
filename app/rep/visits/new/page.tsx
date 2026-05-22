"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { OutletCombobox } from "@/components/outlet-combobox";
import { PhotoUploader, type PhotoFile } from "@/components/photo-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Camera, Check, ChevronLeft, Loader2, MapPin, ShieldCheck, X } from "lucide-react";

const STEPS = ["Outlet", "Photos", "Review"];

type OutletOption = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
};

export default function NewVisitPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [outletId, setOutletId] = useState("");
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { data: outlets = [] } = useQuery<OutletOption[]>({
    queryKey: ["outlets"],
    queryFn: () => fetch("/api/outlets").then((r) => r.json()),
  });

  function captureGps() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("GPS is not available on this device.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setError("Could not get GPS location.");
        setGpsLoading(false);
      },
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const visitRes = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          checkInLat: gps?.lat,
          checkInLng: gps?.lng,
          clientTimestamp: new Date().toISOString(),
          notes,
        }),
      });
      if (!visitRes.ok) throw new Error("Failed to create visit");
      const visit = await visitRes.json();

      for (const photo of photos) {
        const form = new FormData();
        form.append("file", photo.file);
        form.append("imageHash", photo.hash);
        const imgRes = await fetch(`/api/visits/${visit.id}/images`, { method: "POST", body: form });
        if (!imgRes.ok) throw new Error("Failed to upload image");
      }

      const submitRes = await fetch(`/api/visits/${visit.id}/submit`, { method: "POST" });
      if (!submitRes.ok) throw new Error("Failed to submit visit");

      router.push(`/rep/visits/${visit.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const selectedOutlet = outlets.find((o) => o.id === outletId);
  const canContinueFromOutlet = Boolean(outletId && gps);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/rep/visits" className="mb-4 inline-flex items-center text-sm font-semibold text-muted-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Visits
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy">New Visit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Capture outlet proof for AI shelf analysis.</p>
        </div>
        <Button variant="outline" size="icon" className="rounded-full bg-white" asChild>
          <Link href="/rep/visits" aria-label="Close new visit">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <WizardStepper step={step} />

      {step === 0 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Outlet Check-In</CardTitle>
            <p className="text-sm text-muted-foreground">Verify the store before uploading shelf images.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-navy">Outlet</Label>
              <OutletCombobox outlets={outlets} value={outletId} onChange={setOutletId} />
              {selectedOutlet?.address && <p className="text-xs text-muted-foreground">{selectedOutlet.address}</p>}
            </div>

            <div
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                gps ? "border-emerald-200 bg-emerald-50" : "border-[#d6ddea] bg-[#f9f9ff]",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    gps ? "bg-emerald-600 text-white" : "bg-[#eef2fb] text-teal",
                  )}
                >
                  {gps ? <Check className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-navy">Location Verification</p>
                    {gps && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {gps
                      ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                      : "Capture GPS to prove the rep was at the outlet."}
                  </p>
                  <Button
                    type="button"
                    variant={gps ? "outline" : "default"}
                    className="mt-4 w-full rounded-xl"
                    onClick={captureGps}
                    disabled={gpsLoading}
                  >
                    {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {gps ? "Refresh GPS" : "Capture GPS"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-navy">Visit Notes</Label>
              <Textarea
                className="min-h-24 rounded-2xl bg-[#f9f9ff]"
                placeholder="Shelf near front counter, POSM visible near aisle..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <Button className="h-12 w-full rounded-2xl" disabled={!canContinueFromOutlet} onClick={() => setStep(1)}>
              Continue to Photos
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Shelf Evidence</CardTitle>
            <p className="text-sm text-muted-foreground">Upload the full shelf and any POSM material in frame.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-teal/20 bg-cyan-50/70 p-4">
              <div className="flex items-start gap-3">
                <Camera className="mt-0.5 h-5 w-5 text-teal" />
                <div>
                  <p className="font-semibold text-navy">Photo checklist</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Include Olympic packs, competitor packs, shelf rows, and visible POSM if present.
                  </p>
                </div>
              </div>
            </div>

            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button className="h-12 rounded-2xl" disabled={photos.length === 0} onClick={() => setStep(2)}>
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Review Submission</CardTitle>
            <p className="text-sm text-muted-foreground">AI analysis starts as soon as this visit is submitted.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-[#d6ddea] bg-[#f9f9ff] p-4">
              <dl className="space-y-3 text-sm">
                <ReviewRow label="Outlet" value={selectedOutlet ? `${selectedOutlet.name} (${selectedOutlet.code})` : "-"} />
                <ReviewRow label="GPS" value={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Not captured"} />
                <ReviewRow label="Photos" value={`${photos.length} image${photos.length === 1 ? "" : "s"}`} />
                <ReviewRow label="Notes" value={notes || "No notes added"} />
              </dl>
            </div>

            <div className="rounded-2xl border border-teal/20 bg-cyan-50/70 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-teal" />
                <p className="text-sm text-muted-foreground">
                  This will run YOLO shelf detection, POSM LLM review, compliance scoring, and fraud checks.
                </p>
              </div>
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </Button>
              <Button className="h-12 rounded-2xl" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Visit"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WizardStepper({ step }: { step: number }) {
  return (
    <div className="rounded-3xl border border-[#d6ddea] bg-white p-4 shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  i <= step ? "bg-teal text-white shadow-sm" : "bg-[#eef2fb] text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn("text-xs font-semibold", i <= step ? "text-navy" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-2 h-1 flex-1 rounded-full", i < step ? "bg-teal" : "bg-[#d6ddea]")} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}
