"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Plane, Radar, Satellite, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IntelligenceAssessment, ReportLocation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { StepShell } from "./step-shell"
import { VerdictBadge } from "./verdict"

const PHASES = [
  { key: "aircraft", label: "Detecting nearby aircraft", icon: Plane },
  { key: "astronomy", label: "Matching astronomy & ISS", icon: Sparkles },
  { key: "crossref", label: "Cross-referencing signatures", icon: Radar },
  { key: "compile", label: "Compiling assessment", icon: Satellite },
]

export function StepIntelligence({
  stepIndex,
  stepCount,
  location,
  assessment,
  onComplete,
  onSubmit,
  onBack,
  submitting,
}: {
  stepIndex: number
  stepCount: number
  location?: ReportLocation
  assessment: IntelligenceAssessment | null
  onComplete: (a: IntelligenceAssessment) => void
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
}) {
  const [phase, setPhase] = useState(0)
  const [done, setDone] = useState(Boolean(assessment))
  const started = useRef(false)

  useEffect(() => {
    if (started.current || assessment) return
    started.current = true

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setPhase(1), 900))
    timers.push(setTimeout(() => setPhase(2), 1800))
    timers.push(setTimeout(() => setPhase(3), 2600))

    ;(async () => {
      try {
        const res = await fetch("/api/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: location?.lat, lng: location?.lng }),
        })
        const data = (await res.json()) as IntelligenceAssessment
        // Ensure the animation has had a moment to play.
        timers.push(
          setTimeout(() => {
            setDone(true)
            onComplete(data)
          }, 3200),
        )
      } catch {
        timers.push(
          setTimeout(() => {
            setDone(true)
          }, 3200),
        )
      }
    })()

    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 6 — Intelligence"
      title="Intelligence assessment"
      subtitle="Cross-checking your sighting against live aircraft tracks and the night sky."
      onBack={done ? onBack : undefined}
      footer={
        done && assessment ? (
          <Button className="w-full" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit to reviewer
          </Button>
        ) : undefined
      }
    >
      {!done || !assessment ? (
        <ul className="flex flex-col gap-3">
          {PHASES.map((p, i) => {
            const active = i === phase
            const complete = i < phase
            const Icon = p.icon
            return (
              <li
                key={p.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 transition-colors",
                  active
                    ? "border-primary/50 bg-primary/5"
                    : complete
                      ? "border-border bg-card/60"
                      : "border-border bg-card/30 opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    complete ? "bg-chart-3/20 text-chart-3" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {complete ? (
                    <Check className="size-4" />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className="text-sm font-medium">{p.label}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <AssessmentResult assessment={assessment} />
      )}
    </StepShell>
  )
}

function AssessmentResult({ assessment }: { assessment: IntelligenceAssessment }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="flex items-center justify-between">
          <VerdictBadge verdict={assessment.verdict} />
          <span className="font-mono text-sm text-muted-foreground">
            {Math.round(assessment.confidence * 100)}% conf.
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground">{assessment.summary}</p>
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Plane className="size-4 text-accent" />
          Nearby aircraft ({assessment.aircraftNearby.length})
        </div>
        {assessment.aircraftNearby.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracked crewed aircraft in the area.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {assessment.aircraftNearby.map((a) => (
              <li key={a.icao24} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">{a.callsign}</span>
                <span className="text-muted-foreground">
                  {a.distanceKm} km{a.altitudeM ? ` · ${Math.round(a.altitudeM)} m` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" />
          Astronomy matches
        </div>
        {assessment.astronomyMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bright satellites or celestial bodies likely to be confused.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assessment.astronomyMatches.map((m) => (
              <li key={m.body} className="text-sm">
                <span className="font-medium">{m.body}</span>
                <span className="mt-0.5 block text-muted-foreground">{m.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {assessment.dataSources.map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                s.status === "ok" ? "bg-chart-3" : "bg-accent",
              )}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
