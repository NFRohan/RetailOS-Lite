"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type OutletOption = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
};

type Props = {
  outlets: OutletOption[];
  value: string;
  onChange: (id: string) => void;
};

export function OutletCombobox({ outlets, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = outlets.find((o) => o.id === value);

  const filtered = outlets.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 truncate">
          <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
          {selected ? `${selected.name} (${selected.code})` : "Select outlet…"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <input
            className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none"
            placeholder="Search outlets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="max-h-48 overflow-auto p-1">
            {filtered.map((outlet) => (
              <li key={outlet.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                    value === outlet.id && "bg-accent",
                  )}
                  onClick={() => {
                    onChange(outlet.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("h-4 w-4", value === outlet.id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <div className="font-medium">{outlet.name}</div>
                    <div className="text-xs text-muted-foreground">{outlet.code}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
