"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { OutletCombobox } from "@/components/outlet-combobox";
import { PhotoUploader, type PhotoFile } from "@/components/photo-uploader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Outlet", "Photos", "Review"];

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

  const { data: outlets = [] } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => fetch("/api/outlets").then((r) => r.json()),
  });

  function captureGps() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setError("Could not get GPS location");
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

  const selectedOutlet = outlets.find((o: { id: string }) => o.id === outletId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">New visit</h1>

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "flex-1 rounded-lg py-2 text-center text-xs font-medium",
              i === step ? "bg-gold text-navy" : i < step ? "bg-gold/20 text-navy/70" : "bg-muted text-muted-foreground",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outlet & check-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Outlet</Label>
              <OutletCombobox outlets={outlets} value={outletId} onChange={setOutletId} />
            </div>
            <div className="space-y-2">
              <Label>GPS location</Label>
              <Button type="button" variant="outline" className="w-full" onClick={captureGps} disabled={gpsLoading}>
                {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : "Capture GPS"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Shelf near front counter…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!outletId} onClick={() => setStep(1)}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shelf photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PhotoUploader photos={photos} onChange={setPhotos} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button className="flex-1" disabled={photos.length === 0} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Outlet</dt>
                <dd className="font-medium">{selectedOutlet?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">GPS</dt>
                <dd>{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : "Not captured"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Photos</dt>
                <dd>{photos.length}</dd>
              </div>
            </dl>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit for AI analysis"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
