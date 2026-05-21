"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "fraud", label: "Fraud checks" },
  { id: "yolo", label: "YOLO detection" },
  { id: "compliance", label: "Compliance" },
  { id: "summary", label: "AI summary" },
];

export function AnalyzingPipeline({ activeStep = 2 }: { activeStep?: number }) {
  return (
    <div className="rounded-xl border border-gold/20 bg-gold/5 p-6">
      <p className="mb-4 text-sm font-medium text-gold">AI pipeline running…</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          return (
            <div key={step.id} className="flex items-center gap-2 sm:flex-col sm:gap-1">
              <motion.div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                  done && "border-emerald-500 bg-emerald-500/20 text-emerald-400",
                  active && "border-gold bg-gold/20 text-gold animate-pulse-ring",
                  !done && !active && "border-muted text-muted-foreground",
                )}
                animate={active ? { scale: [1, 1.05, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
              </motion.div>
              <span className={cn("text-xs", active ? "text-gold font-medium" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
