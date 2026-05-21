"use client";

import { useState } from "react";
import { cn, hashFileSha256 } from "@/lib/utils";

type Props = {
  rawUrl: string;
  overlayUrl?: string | null;
  alt?: string;
};

export function ImageCompareSlider({ rawUrl, overlayUrl, alt = "Shelf image" }: Props) {
  const [position, setPosition] = useState(50);
  const [mode, setMode] = useState<"slider" | "toggle">("slider");
  const [showOverlay, setShowOverlay] = useState(false);

  if (!overlayUrl) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rawUrl} alt={alt} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("slider")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium",
            mode === "slider" ? "bg-gold text-navy" : "bg-muted text-muted-foreground",
          )}
        >
          Compare slider
        </button>
        <button
          type="button"
          onClick={() => setMode("toggle")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium",
            mode === "toggle" ? "bg-gold text-navy" : "bg-muted text-muted-foreground",
          )}
        >
          Toggle view
        </button>
      </div>

      {mode === "slider" ? (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={overlayUrl} alt={`${alt} overlay`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rawUrl} alt={alt} className="h-full w-full object-cover" style={{ width: `${100 / (position / 100)}%`, maxWidth: "none" }} />
          </div>
          <div
            className="absolute inset-y-0 w-1 bg-gold shadow-lg"
            style={{ left: `${position}%`, transform: "translateX(-50%)" }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
          />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
            Raw
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
            YOLO overlay
          </div>
        </div>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={showOverlay ? overlayUrl : rawUrl} alt={alt} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => setShowOverlay(!showOverlay)}
            className="absolute bottom-3 right-3 rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-navy"
          >
            {showOverlay ? "Show raw" : "Show overlay"}
          </button>
        </div>
      )}
    </div>
  );
}
