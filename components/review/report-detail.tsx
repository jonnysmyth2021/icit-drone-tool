"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Dialog } from "@base-ui/react/dialog"
import { useState } from "react"
import { BrainCircuit, Check, CloudSun, Eye, Film, Gavel, Lightbulb, Loader2, MapPin, Mountain, Plane, ShieldAlert, Trash2, Wind, X } from "lucide-react"
import { VerdictBadge } from "@/components/report/verdict"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { DroneReport, ReportStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { zonesContaining } from "@/lib/uk-frz"
import { MiniMap } from "./mini-map"
import { AircraftSnapshotMap } from "./aircraft-snapshot-map"

const STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: "Submitted",
  reviewing: "In review",
  confirmed: "Confirmed",
  rejected: "Rejected",
}

export function ReportDetail({
  report,
  onSetStatus,
  onDelete,
  onAnalyzePhotos,
}: {
  report: DroneReport
  onSetStatus: (status: ReportStatus, note?: string) => void
  onDelete: () => Promise<void>
  onAnalyzePhotos: () => Promise<void>
}) {
  const [note, setNote] = useState(report.reviewerNote ?? "")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [viewingImage, setViewingImage] = useState<{ src: string; alt: string } | null>(null)
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const decided = report.status === "confirmed" || report.status === "rejected"

  function decide(status: ReportStatus) {
    onSetStatus(status, note.trim() || undefined)
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete this report.")
      setDeleting(false)
    }
  }

  async function analyzePhotos() {
    setAnalyzingPhotos(true)
    setAnalysisError(null)
    try {
      await onAnalyzePhotos()
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Unable to analyse report photos.")
    } finally {
      setAnalyzingPhotos(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm font-semibold text-primary">{report.reference}</p>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
              report.status === "confirmed" && "border-chart-3/40 bg-chart-3/15 text-chart-3",
              report.status === "rejected" && "border-destructive/40 bg-destructive/15 text-destructive",
              report.status === "submitted" && "border-border bg-secondary text-muted-foreground",
              report.status === "reviewing" && "border-accent/40 bg-accent/15 text-accent",
            )}
          >
            {STATUS_LABEL[report.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()} · {report.reporter}
        </p>
      </div>

      {report.intelligence ? (
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <div className="flex items-center justify-between">
            <VerdictBadge verdict={report.intelligence.verdict} />
            <span className="font-mono text-sm text-muted-foreground">
              {Math.round(report.intelligence.confidence * 100)}%
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{report.intelligence.summary}</p>
        </div>
      ) : null}

      {report.intelligence?.visualEvidence ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={Eye}>AI visual evidence</SectionTitle>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-primary">
              {report.intelligence.visualEvidence.classification.replaceAll("_", " ")} · {Math.round(report.intelligence.visualEvidence.confidence * 100)}%
            </span>
          </div>
          <p className="text-sm leading-relaxed">{report.intelligence.visualEvidence.summary}</p>
          <div className="mt-3 space-y-2">
            {report.intelligence.visualEvidence.images.map((image, index) => (
              <div key={`${image.evidenceId}-${index}`} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">Image {index + 1}</span>
                  <span className="capitalize text-muted-foreground">
                    {image.classification.replaceAll("_", " ")} · {Math.round(image.confidence * 100)}% · {image.quality} quality
                  </span>
                </div>
                {image.visibleFeatures.length > 0 ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Visible: {image.visibleFeatures.join("; ")}
                  </p>
                ) : null}
                {image.limitations.length > 0 ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Limitations: {image.limitations.join("; ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Initial verdict: {report.intelligence.visualEvidence.initialVerdict.replaceAll("_", " ")} · analysed {new Date(report.intelligence.visualEvidence.generatedAt).toLocaleString()}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            onClick={() => void analyzePhotos()}
            disabled={analyzingPhotos}
          >
            {analyzingPhotos ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
            {analyzingPhotos ? "Reanalysing photos…" : "Reanalyse photos"}
          </Button>
          {analysisError ? <p className="mt-2 text-xs text-destructive">{analysisError}</p> : null}
        </div>
      ) : report.evidence.some((item) => item.preview && item.mimeType.startsWith("image/")) ? (
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <SectionTitle icon={BrainCircuit}>AI visual evidence</SectionTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This report predates automatic photo analysis. Analyse its stored photos and reconcile the result with aircraft and location intelligence.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            onClick={() => void analyzePhotos()}
            disabled={analyzingPhotos}
          >
            {analyzingPhotos ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
            {analyzingPhotos ? "Analysing photos…" : "Analyse stored photos"}
          </Button>
          {analysisError ? <p className="mt-2 text-xs text-destructive">{analysisError}</p> : null}
        </div>
      ) : null}

      {report.intelligence?.airspace ? (
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={ShieldAlert}>Airspace Intelligence</SectionTitle>
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                report.intelligence.airspace.riskLevel === "CRITICAL" && "border-destructive/50 bg-destructive/15 text-destructive",
                report.intelligence.airspace.riskLevel === "HIGH" && "border-orange-500/50 bg-orange-500/15 text-orange-600 dark:text-orange-300",
                report.intelligence.airspace.riskLevel === "MEDIUM" && "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
                report.intelligence.airspace.riskLevel === "LOW" && "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {report.intelligence.airspace.riskLevel} · {report.intelligence.airspace.score}/100
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <AirspaceCount label="Permanent" count={report.intelligence.airspace.permanentRestrictions.length} />
            <AirspaceCount label="Temporary" count={report.intelligence.airspace.temporaryRestrictions.length} />
            <AirspaceCount label="Infrastructure" count={report.intelligence.airspace.criticalInfrastructure.length} />
          </div>
          {report.intelligence.airspace.restrictions.length > 0 ? (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background/50 px-3">
              {report.intelligence.airspace.restrictions.map((restriction) => (
                <li key={restriction.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{restriction.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {restriction.subCategory.replaceAll("_", " ")} · {restriction.legalStatus}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {restriction.inside ? "Inside" : `${Math.round(restriction.distanceMetres)}m`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No indexed restrictions intersect this report location.</p>
          )}
          {report.intelligence.airspace.operationalRisks.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operational risks</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                {report.intelligence.airspace.operationalRisks.map((risk) => <li key={risk}>{risk}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended actions</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
              {report.intelligence.airspace.recommendedActions.map((action) => <li key={action}>{action}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      {report.intelligence?.weather ? (
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <SectionTitle icon={CloudSun}>Weather at time of report</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wind className="size-3.5" /> Wind speed
              </p>
              <p className="mt-1 font-mono text-lg font-semibold">
                {report.intelligence.weather.windSpeedMph} mph
              </p>
              <p className="text-xs text-muted-foreground">
                {report.intelligence.weather.windSpeedMps.toFixed(1)} m/s
                {report.intelligence.weather.windDirectionDegrees != null
                  ? ` · ${Math.round(report.intelligence.weather.windDirectionDegrees)}°`
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">Conditions</p>
              <p className="mt-1 text-sm font-semibold capitalize">
                {report.intelligence.weather.conditions ?? "Current conditions"}
              </p>
              {report.intelligence.weather.temperatureC != null ? (
                <p className="text-xs text-muted-foreground">
                  {Math.round(report.intelligence.weather.temperatureC)}°C
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Captured {new Date(report.intelligence.weather.observedAt).toLocaleString()}
            {report.intelligence.weather.windGustMph != null
              ? ` · gusts ${report.intelligence.weather.windGustMph} mph`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Fact icon={Plane} label="Type" value={report.droneType} />
        <Fact
          icon={Lightbulb}
          label="Lights"
          value={report.lightsVisible === "Yes" ? report.lightColors.join(", ") || "Yes" : report.lightsVisible}
        />
        <Fact icon={Mountain} label="Altitude" value={report.altitude} />
      </div>

      <div>
        <SectionTitle icon={MapPin}>Location</SectionTitle>
        {(() => {
          const frzHits = zonesContaining(report.location)
          if (frzHits.length === 0) return null
          return (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/15 p-2.5 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">Inside a Flight Restriction Zone.</span> This
                sighting falls within {frzHits.map((z) => z.name).join(", ")} FRZ — drone operation
                here requires ATC permission.
              </span>
            </div>
          )
        })()}
        <div className="overflow-hidden rounded-xl border border-border">
          <MiniMap location={report.location} />
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
          {report.location.bearing != null ? ` · bearing ${Math.round(report.location.bearing)}°` : ""}
          {report.location.accuracy != null ? ` · ±${Math.round(report.location.accuracy)}m` : ""}
        </p>
      </div>

      <div>
        <SectionTitle icon={Film}>Evidence ({report.evidence.length})</SectionTitle>
        {report.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence attached.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {report.evidence.map((e) => (
              <li key={e.id} className="flex gap-3 rounded-lg border border-border bg-card/70 p-2.5">
                <div className="size-16 shrink-0 overflow-hidden rounded-md bg-secondary">
                  {e.kind === "photo" && e.preview ? (
                    <button
                      type="button"
                      className="size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => setViewingImage({ src: e.preview, alt: e.fileName })}
                      aria-label={`View ${e.fileName}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.preview}
                        alt={e.fileName}
                        className="size-full object-cover transition-transform hover:scale-105"
                      />
                    </button>
                  ) : e.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.preview || "/placeholder.svg"} alt={e.fileName} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Film className="size-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.fileName}</p>
                  <p className="text-xs uppercase text-muted-foreground">
                    {e.kind} · {e.source}
                  </p>
                  <MetaList metadata={e.metadata} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog.Root
        open={viewingImage !== null}
        onOpenChange={(open) => !open && setViewingImage(null)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Viewport className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8">
            <Dialog.Popup className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl outline-none transition duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <Dialog.Title className="sr-only">Evidence photo viewer</Dialog.Title>
              <Dialog.Description className="sr-only">
                Enlarged view of {viewingImage?.alt ?? "the selected evidence photo"}.
              </Dialog.Description>
              <Dialog.Close
                className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Close photo viewer"
              >
                <X className="size-5" />
              </Dialog.Close>
              {viewingImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingImage.src}
                    alt={viewingImage.alt}
                    className="max-h-[82vh] w-full object-contain"
                  />
                  <p className="truncate border-t border-white/10 px-4 py-3 text-sm text-white/80">
                    {viewingImage.alt}
                  </p>
                </>
              ) : null}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      {report.intelligence && report.intelligence.aircraftNearby.length > 0 ? (
        <div>
          <SectionTitle icon={Plane}>Aircraft at time of sighting</SectionTitle>
          <div className="mb-3 overflow-hidden rounded-xl border border-border">
            <AircraftSnapshotMap
              location={report.location}
              aircraft={report.intelligence.aircraftNearby}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground">
              <span>Blue dot: sighting location · planes coloured by altitude</span>
              <span className="shrink-0 font-mono">
                {new Date(report.intelligence.generatedAt).toLocaleString()}
              </span>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card/70 px-3">
            {report.intelligence.aircraftNearby.map((a) => (
              <li key={a.icao24} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">{a.callsign}</span>
                <span className="text-muted-foreground">
                  {a.distanceKm} km · {a.originCountry ?? a.registration ?? "Unknown"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Separator />

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <SectionTitle icon={Gavel}>Reviewer decision</SectionTitle>

        <Label htmlFor="decision-note" className="text-xs text-muted-foreground">
          Decision log — justify your assessment
        </Label>
        <Textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Confirmed multi-rotor: no ADS-B traffic within 5 km, observer footage shows quadcopter silhouette, sighting inside Heathrow FRZ."
          className="mt-1.5 resize-none text-sm"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className={cn(
              "h-11 bg-foreground font-medium text-background hover:bg-foreground/90",
              report.status === "confirmed" &&
                "ring-2 ring-foreground ring-offset-2 ring-offset-card",
            )}
            onClick={() => decide("confirmed")}
          >
            <Check className="size-4" />
            {report.status === "confirmed" ? "Confirmed" : "Confirm drone"}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className={cn(
              "h-11 font-medium",
              report.status === "rejected" &&
                "ring-2 ring-destructive ring-offset-2 ring-offset-card",
            )}
            onClick={() => decide("rejected")}
          >
            <X className="size-4" />
            {report.status === "rejected" ? "Rejected" : "Reject sighting"}
          </Button>
        </div>

        {report.status !== "reviewing" && !decided && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-muted-foreground"
            onClick={() => onSetStatus("reviewing", note.trim() || undefined)}
          >
            Mark as under review
          </Button>
        )}

        {decided && (
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
            Saved as {report.status === "confirmed" ? "Confirmed" : "Rejected"}. Update the log and
            re-select a decision to revise.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <SectionTitle icon={Trash2}>Delete report</SectionTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Permanently removes this report, its intelligence record, and attached evidence.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Delete report
        </Button>
      </div>

      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <AlertDialog.Popup className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl outline-none transition duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <span className="flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <Trash2 className="size-5" />
              </span>
              <AlertDialog.Title className="mt-4 text-lg font-semibold">
                Delete this report?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Report <span className="font-mono text-foreground">{report.reference}</span> and its
                evidence will be permanently removed. This cannot be undone.
              </AlertDialog.Description>
              {deleteError ? (
                <p className="mt-3 text-sm text-destructive">{deleteError}</p>
              ) : null}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <AlertDialog.Close
                  className={buttonVariants({ variant: "secondary" })}
                  disabled={deleting}
                >
                  Cancel
                </AlertDialog.Close>
                <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>

    </div>
  )
}

function AirspaceCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-2 py-2.5">
      <p className="font-mono text-lg font-semibold">{count}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium leading-tight">{value}</p>
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </p>
  )
}

function MetaList({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([, v]) => v != null && v !== "")
  if (entries.length === 0) {
    return <p className="mt-1 text-xs text-muted-foreground">No embedded metadata.</p>
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.slice(0, 8).map(([k, v]) => (
        <span
          key={k}
          className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {k}: {formatVal(v)}
        </span>
      ))}
    </div>
  )
}

function formatVal(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v).slice(0, 24)
}
