"use client"

import { useState } from "react"
import { Check, Film, Gavel, Lightbulb, MapPin, Mountain, Plane, ShieldAlert, X } from "lucide-react"
import { VerdictBadge } from "@/components/report/verdict"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { DroneReport, ReportStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { zonesContaining } from "@/lib/uk-frz"
import { MiniMap } from "./mini-map"

const STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: "Submitted",
  reviewing: "In review",
  confirmed: "Confirmed",
  rejected: "Rejected",
}

export function ReportDetail({
  report,
  onSetStatus,
}: {
  report: DroneReport
  onSetStatus: (status: ReportStatus, note?: string) => void
}) {
  const [note, setNote] = useState(report.reviewerNote ?? "")
  const decided = report.status === "confirmed" || report.status === "rejected"

  function decide(status: ReportStatus) {
    onSetStatus(status, note.trim() || undefined)
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
                  {e.preview ? (
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

      {report.intelligence && report.intelligence.aircraftNearby.length > 0 ? (
        <div>
          <SectionTitle icon={Plane}>Aircraft at time of sighting</SectionTitle>
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
