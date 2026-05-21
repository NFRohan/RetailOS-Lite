"use client";

import { useCallback, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { cn, hashFileSha256 } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PhotoFile = {
  file: File;
  preview: string;
  hash: string;
};

type Props = {
  photos: PhotoFile[];
  onChange: (photos: PhotoFile[]) => void;
};

export function PhotoUploader({ photos, onChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const newPhotos: PhotoFile[] = [];
      for (const file of list) {
        const hash = await hashFileSha256(file);
        newPhotos.push({ file, preview: URL.createObjectURL(file), hash });
      }
      onChange([...photos, ...newPhotos]);
    },
    [photos, onChange],
  );

  const remove = (index: number) => {
    URL.revokeObjectURL(photos[index].preview);
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
          dragging ? "border-gold bg-gold/5" : "border-muted-foreground/25 hover:border-gold/50",
        )}
      >
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 text-sm font-medium">Drop shelf photos here</p>
        <p className="mb-4 text-xs text-muted-foreground">JPG or PNG</p>
        <label>
          <Button type="button" variant="outline" asChild>
            <span>Browse files</span>
          </Button>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void addFiles(e.target.files)}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <div key={photo.hash} className="group relative aspect-square overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-black/50 px-2 py-1 text-[10px] text-white">
                <ImageIcon className="h-3 w-3" />
                {photo.hash.slice(0, 8)}…
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
