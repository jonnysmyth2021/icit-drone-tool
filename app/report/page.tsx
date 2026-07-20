"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckCircle2, LayoutDashboard, LogOut, Plus } from "lucide-react"
import { toast } from "sonner"
import { Brand } from "@/components/brand"
import { StepAltitude } from "@/components/report/step-altitude"
import { StepEvidence } from "@/components/report/step-evidence"
import { StepIntelligence } from "@/components/report/step-intelligence"
import { StepLights } from "@/components/report/step-lights"
import { StepLocation } from "@/components/report/step-location"
import { StepType } from "@/components/report/step-type"
import { VerdictBadge } from "@/components/report/verdict"
import { Button } from "@/components/ui/button"
import {
  type DraftReport,
  type DroneReport,
  type IntelligenceAssessment,
  type LightColor,
  type LightsVisible,
} from "@/lib/types"
import {
  clearSession,
  getSession,
  makeReference,
  setSession as persistSession,
  type Session,
} from "@/lib/store"
import { createReport } from "@/app/actions/reports"
import { getCurrentSession, signOut } from "@/app/actions/auth"

type Step = "type" | "lights" | "altitude" | "evidence" | "location" | "intelligence" | "complete"

const STEP_COUNT = 6

const EMPTY_DRAFT: DraftReport = { lightColors: [], evidence: [], intelligence: null }

export default function ReportPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [step, setStep] = useState<Step>("type")
  const [draft, setDraft] = useState<DraftReport>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState<DroneReport | null>(null)

  useEffect(() => {
    let active = true
    const localSession = getSession()

    if (localSession) {
      setSession(localSession)
      return
    }

    void getCurrentSession().then((serverSession) => {
      if (!active) return
      if (!serverSession) {
        router.replace("/")
        return
      }
      persistSession(serverSession)
      setSession(serverSession)
    })

    return () => {
      active = false
    }
  }, [router])

  if (!session) return null

  function logout() {
    void signOut()
    clearSession()
    router.replace("/")
  }

  function reset() {
    setDraft(EMPTY_DRAFT)
    setSaved(null)
    setStep("type")
  }

  function selectLights(v: LightsVisible) {
    setDraft((d) => ({ ...d, lightsVisible: v, lightColors: v === "Yes" ? d.lightColors : [] }))
    if (v !== "Yes") setStep("altitude")
  }

  function toggleColor(c: LightColor) {
    setDraft((d) => ({
      ...d,
      lightColors: d.lightColors.includes(c)
        ? d.lightColors.filter((x) => x !== c)
        : [...d.lightColors, c],
    }))
  }

  async function submit() {
    setSubmitting(true)
    const report: DroneReport = {
      id: crypto.randomUUID(),
      reference: makeReference(),
      createdAt: new Date().toISOString(),
      reporter: session!.user,
      droneType: draft.droneType ?? "Unknown",
      lightsVisible: draft.lightsVisible ?? "Unknown",
      lightColors: draft.lightColors,
      altitude: draft.altitude ?? "Unknown",
      evidence: draft.evidence,
      location: draft.location ?? {
        lat: 51.5072,
        lng: -0.1276,
        accuracy: null,
        bearing: null,
        deviceHeading: null,
      },
      intelligence: draft.intelligence ?? null,
      status: "submitted",
    }
    try {
      await createReport(report)
    } catch (err) {
      console.error("[icit] createReport failed", err)
      toast.error(err instanceof Error ? err.message : "Unable to submit this report.")
      setSubmitting(false)
      return
    }
    setSaved(report)
    setStep("complete")
    setSubmitting(false)
  }

  if (step === "complete" && saved) {
    return (
      <main className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <Brand size="sm" />
          <div className="flex items-center gap-1">
            {session.role === "admin" ? (
              <Button variant="ghost" size="sm" onClick={() => router.push("/review")}>
                <LayoutDashboard className="size-4" />
                Dashboard
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-chart-3/15 text-chart-3">
            <CheckCircle2 className="size-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Report submitted</h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            Your sighting has been sent to the ICIT reviewer team. Keep this reference for any
            follow-up.
          </p>
          <div className="mt-5 w-full rounded-xl border border-border bg-card/70 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Reference
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-primary">{saved.reference}</p>
            {saved.intelligence ? (
              <div className="mt-3 flex justify-center">
                <VerdictBadge verdict={saved.intelligence.verdict} />
              </div>
            ) : null}
          </div>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={reset}>
              <Plus className="size-4" />
              Submit another sighting
            </Button>
            {session.role === "admin" ? (
              <Button variant="secondary" onClick={() => router.push("/review")}>
                <LayoutDashboard className="size-4" />
                Open reviewer dashboard
              </Button>
            ) : null}
          </div>
        </div>
      </main>
    )
  }

  switch (step) {
    case "type":
      return (
        <StepType
          stepIndex={0}
          stepCount={STEP_COUNT}
          value={draft.droneType}
          onSelect={(v) => {
            setDraft((d) => ({ ...d, droneType: v }))
            setStep("lights")
          }}
        />
      )
    case "lights":
      return (
        <StepLights
          stepIndex={1}
          stepCount={STEP_COUNT}
          value={draft.lightsVisible}
          colors={draft.lightColors}
          onSelect={selectLights}
          onToggleColor={toggleColor}
          onContinue={() => setStep("altitude")}
          onBack={() => setStep("type")}
        />
      )
    case "altitude":
      return (
        <StepAltitude
          stepIndex={2}
          stepCount={STEP_COUNT}
          value={draft.altitude}
          onSelect={(v) => {
            setDraft((d) => ({ ...d, altitude: v }))
            setStep("evidence")
          }}
          onBack={() => setStep("lights")}
        />
      )
    case "evidence":
      return (
        <StepEvidence
          stepIndex={3}
          stepCount={STEP_COUNT}
          evidence={draft.evidence}
          onAdd={(items) => setDraft((d) => ({ ...d, evidence: [...d.evidence, ...items] }))}
          onRemove={(id) =>
            setDraft((d) => ({ ...d, evidence: d.evidence.filter((e) => e.id !== id) }))
          }
          onContinue={() => setStep("location")}
          onBack={() => setStep("altitude")}
        />
      )
    case "location":
      return (
        <StepLocation
          stepIndex={4}
          stepCount={STEP_COUNT}
          value={draft.location}
          onChange={(loc) => setDraft((d) => ({ ...d, location: loc }))}
          onContinue={() => setStep("intelligence")}
          onBack={() => setStep("evidence")}
        />
      )
    case "intelligence":
      return (
        <StepIntelligence
          stepIndex={5}
          stepCount={STEP_COUNT}
          location={draft.location}
          observation={{
            droneType: draft.droneType ?? "Unknown",
            lightsVisible: draft.lightsVisible ?? "Unknown",
            lightColors: draft.lightColors,
            altitude: draft.altitude ?? "Unknown",
            evidenceCount: draft.evidence.length,
            evidence: draft.evidence.map((item) => ({
              kind: item.kind,
              mimeType: item.mimeType,
              source: item.source,
              capturedAt: item.capturedAt,
              metadata: item.metadata,
            })),
            bearing: draft.location?.bearing ?? null,
            deviceHeading: draft.location?.deviceHeading ?? null,
            locationAccuracyM: draft.location?.accuracy ?? null,
          }}
          assessment={draft.intelligence ?? null}
          onComplete={(a: IntelligenceAssessment) =>
            setDraft((d) => ({ ...d, intelligence: a }))
          }
          onSubmit={submit}
          onBack={() => setStep("location")}
          submitting={submitting}
        />
      )
    default:
      return null
  }
}
