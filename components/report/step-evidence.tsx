"use client"

import { useRef, useState } from "react"
import { Camera, Film, ImagePlus, Loader2, MapPin, Trash2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { processFile } from "@/lib/media"
import type { EvidenceItem } from "@/lib/types"
import { OptionCard } from "./option-card"
import { StepShell } from "./step-shell"

export function StepEvidence({
  stepIndex,
  stepCount,
  evidence,
  onAdd,
  onRemove,
  onContinue,
  onBack,
}: {
  stepIndex: number
  stepCount: number
  evidence: EvidenceItem[]
  onAdd: (items: EvidenceItem[]) => void
  onRemove: (id: string) => void
  onContinue: () => void
  onBack: () => void
}) {
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: FileList | null, source: "camera" | "upload") {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const processed = await Promise.all(Array.from(files).map((f) => processFile(f, source)))
      onAdd(processed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 4 — Evidence"
      title="Capture evidence"
      subtitle="Photos and video are timestamped and any embedded EXIF / GPS metadata is extracted automatically."
      onBack={onBack}
      footer={
        <Button className="w-full" onClick={onContinue}>
          <MapPin className="size-4" />
          Confirm location
        </Button>
      }
    >
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files, "camera")}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files, "camera")}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files, "upload")}
      />

      <div className="flex flex-col gap-3">
        <OptionCard label="Take Photo" description="Open your camera and snap a still." icon={Camera} onClick={() => photoRef.current?.click()} />
        <OptionCard label="Record Video" description="Open your camera to record footage." icon={Video} onClick={() => videoRef.current?.click()} />
        <OptionCard
          label="Upload Multiple"
          description="Choose existing photos and videos from your device."
          icon={ImagePlus}
          onClick={() => uploadRef.current?.click()}
        />
      </div>

      {busy ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-border bg-card/60 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Extracting metadata…
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Attached ({evidence.length})
          </p>
          <ul className="flex flex-col gap-2.5">
            {evidence.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card/70 p-2.5"
              >
                <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                  {item.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview || "/placeholder.svg"} alt={item.fileName} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Film className="size-5" />
                    </div>
                  )}
                  {item.kind === "video" ? (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                      VID
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {metaSummary(item)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  aria-label={`Remove ${item.fileName}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </StepShell>
  )
}

function metaSummary(item: EvidenceItem): string {
  const parts: string[] = [item.source === "camera" ? "Camera" : "Uploaded"]
  const m = item.metadata
  if (m.model) parts.push(String(m.model))
  if (m.gpsLatitude != null || m.capturedLatitude != null) parts.push("GPS tagged")
  if (m.durationSeconds != null) parts.push(`${m.durationSeconds}s`)
  if (item.sizeBytes) parts.push(`${(item.sizeBytes / 1_000_000).toFixed(1)} MB`)
  return parts.join(" · ")
}
