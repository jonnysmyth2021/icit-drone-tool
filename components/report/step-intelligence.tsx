"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Radar,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IntelligenceAssessment, ReportLocation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { StepShell } from "./step-shell"

const PHASES = [
  { key: "details", label: "Securing report details", icon: FileCheck2 },
  { key: "supporting", label: "Checking supporting data", icon: Radar },
  { key: "evidence", label: "Preparing evidence package", icon: ShieldCheck },
  { key: "compile", label: "Finalising submission", icon: CheckCircle2 },
]

export function StepIntelligence({
  stepIndex,
  stepCount,
  location,
  observation,
  assessment,
  onComplete,
  onSubmit,
  onBack,
  submitting,
}: {
  stepIndex: number
  stepCount: number
  location?: ReportLocation
  observation: Record<string, unknown>
  assessment: IntelligenceAssessment | null
  onComplete: (assessment: IntelligenceAssessment) => void
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
}) {
  const [phase, setPhase] = useState(0)
  const [done, setDone] = useState(Boolean(assessment))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
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
        const response = await fetch("/api/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: location?.lat, lng: location?.lng, observation }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? "Report preparation failed.")
        }
        const data = (await response.json()) as IntelligenceAssessment
        timers.push(
          setTimeout(() => {
            setDone(true)
            onComplete(data)
          }, 3200),
        )
      } catch (requestError) {
        timers.push(
          setTimeout(() => {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Report preparation is temporarily unavailable.",
            )
            setDone(true)
          }, 3200),
        )
      }
    })()

    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  function retry() {
    started.current = false
    setPhase(0)
    setDone(false)
    setError(null)
    setAttempt((value) => value + 1)
  }

  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow={`Step ${stepIndex + 1} of ${stepCount}`}
      title="Preparing your report"
      subtitle="We’re securely packaging your sighting and supporting information for the ICIT review team."
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
      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-center">
          <AlertTriangle className="mx-auto size-7 text-destructive" />
          <h2 className="mt-3 font-semibold">Report preparation unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={retry}>
            <RotateCcw className="size-4" />
            Retry
          </Button>
        </div>
      ) : !done || !assessment ? (
        <ul className="flex flex-col gap-3">
          {PHASES.map((item, index) => {
            const active = index === phase
            const complete = index < phase
            const Icon = item.icon
            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border p-4 transition-colors",
                  active
                    ? "border-primary/60 bg-primary/8"
                    : complete
                      ? "border-border bg-card/55"
                      : "border-border bg-card/35 opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl",
                    complete ? "bg-primary/15 text-primary" : "bg-secondary text-primary",
                  )}
                >
                  {complete ? (
                    <Check className="size-5" />
                  ) : active ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <ReportReady />
      )}
    </StepShell>
  )
}

function ReportReady() {
  return (
    <div className="rounded-2xl border border-primary/45 bg-card/55 p-6 text-center shadow-sm">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <CheckCircle2 className="size-8" />
      </span>
      <h2 className="mt-5 text-xl font-semibold">Report checks complete</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your sighting is ready to submit. The ICIT review team will assess the evidence and
        supporting information.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 border-t border-border pt-4 text-xs font-medium text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" />
        Decision information is available only to authorised reviewers
      </div>
    </div>
  )
}
