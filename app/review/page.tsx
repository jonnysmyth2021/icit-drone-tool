"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, ChevronLeft, ListChecks, LogOut, Plus, RadioTower, RefreshCw, Search, ShieldAlert, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"

import { Brand } from "@/components/brand"
import { ReportDetail } from "@/components/review/report-detail"
import { ReportsMap } from "@/components/review/reports-map"
import { AnalyticsPanel } from "@/components/review/analytics-panel"
import { VERDICT_META } from "@/components/report/verdict"
import { zonesContaining } from "@/lib/uk-frz"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { clearSession, getSession, setSession } from "@/lib/store"
import { deleteReport, listReports, setReportStatus } from "@/app/actions/reports"
import { getCurrentSession, signOut } from "@/app/actions/auth"
import type { DroneReport, ReportStatus } from "@/lib/types"

const STATUS_FILTERS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submitted", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
]

export default function ReviewPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [reports, setReports] = useState<DroneReport[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ReportStatus | "all">("all")
  const [loading, setLoading] = useState(true)
  const [decisionAck, setDecisionAck] = useState<{
    status: "confirmed" | "rejected"
    reference: string
  } | null>(null)

  useEffect(() => {
    let active = true
    const localSession = getSession()

    async function authorize() {
      const session = localSession ?? (await getCurrentSession())
      if (!active) return

      if (!session) {
        router.replace("/")
        return
      }
      if (session.role !== "admin") {
        setAuthorized(false)
        return
      }

      if (!localSession) setSession(session)
      setAuthorized(true)
      void refresh()
    }

    void authorize()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function refresh() {
    setLoading(true)
    try {
      setReports(await listReports())
    } catch (err) {
      console.error("[v0] failed to load reports", err)
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return reports
      .filter((r) => (filter === "all" ? true : r.status === filter))
      .filter((r) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          r.reference.toLowerCase().includes(q) ||
          r.droneType.toLowerCase().includes(q) ||
          (r.intelligence?.verdict ?? "").toLowerCase().includes(q)
        )
      })
  }, [reports, filter, query])

  const selected = reports.find((r) => r.id === selectedId) ?? null

  const stats = useMemo(
    () => ({
      total: reports.length,
      pending: reports.filter((r) => r.status === "submitted" || r.status === "reviewing").length,
      drone: reports.filter((r) => r.intelligence?.verdict === "likely_drone").length,
      inFrz: reports.filter((r) => r.location && zonesContaining(r.location).length > 0).length,
    }),
    [reports],
  )

  async function handleSetStatus(id: string, status: ReportStatus, note?: string) {
    // Optimistic update for snappy UI, then persist server-side.
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, reviewerNote: note ?? r.reviewerNote } : r)),
    )
    if (status === "confirmed" || status === "rejected") {
      const ref = reports.find((r) => r.id === id)?.reference ?? ""
      setDecisionAck({ status, reference: ref })
    }
    try {
      await setReportStatus(id, status, note)
    } catch (err) {
      console.error("[v0] failed to update status", err)
      await refresh()
    }
  }

  async function handleDeleteReport(id: string) {
    try {
      const result = await deleteReport(id)
      setReports((current) => current.filter((report) => report.id !== id))
      setSelectedId(null)
      if (result.cleanupWarning) toast.warning(result.cleanupWarning)
      else toast.success("Report deleted.")
    } catch (error) {
      console.error("[icit] failed to delete report", error)
      toast.error(error instanceof Error ? error.message : "Unable to delete this report.")
      throw error
    }
  }

  function handleLogout() {
    void signOut()
    clearSession()
    router.replace("/")
  }

  if (authorized === null) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <RadioTower className="size-6 animate-pulse text-primary" />
      </main>
    )
  }

  if (authorized === false) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert className="size-10 text-destructive" />
        <h1 className="text-balance text-xl font-semibold">Restricted area</h1>
        <p className="max-w-sm text-pretty text-sm text-muted-foreground">
          The Review Dashboard is only accessible to ICIT reviewers. Enter reviewer access to triage
          submitted sightings, or return to reporting.
        </p>
        <Button variant="ghost" size="sm" onClick={() => router.replace("/report")}>
          <ChevronLeft className="size-4" />
          Back to reporting
        </Button>
      </main>
    )
  }

  return (
    <main className="min-h-svh">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Brand size="sm" />
            <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary sm:inline">
              Review Dashboard
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => router.push("/report")}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">New sighting</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="operations">
          <TabsList className="mb-6">
            <TabsTrigger value="operations">
              <ListChecks className="size-4" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="operations">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Sighting map</h2>
            <span className="text-xs text-muted-foreground">
              {filtered.filter((r) => r.location).length} plotted
            </span>
          </div>
          <ReportsMap reports={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total reports" value={stats.total} />
          <StatCard label="Awaiting review" value={stats.pending} accent />
          <StatCard label="Drone-flagged" value={stats.drone} danger />
          <StatCard label="Inside FRZ" value={stats.inFrz} danger />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reference, type, verdict"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && reports.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-12 text-center">
            <RadioTower className="size-8 animate-pulse text-primary" />
            <p className="text-sm text-muted-foreground">Loading reports…</p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-12 text-center">
            <RadioTower className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reports match the current filter.</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => {
              const meta = VERDICT_META[r.intelligence?.verdict ?? "inconclusive"]
              const VerdictIcon = meta.icon
              const thumb = r.evidence.find((e) => e.preview)
              const frzHits = r.location ? zonesContaining(r.location) : []
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer p-4 transition-colors hover:border-primary/50"
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb.preview || "/placeholder.svg"}
                          alt="Sighting thumbnail"
                          className="size-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <RadioTower className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary">{r.reference}</span>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-1 font-medium">{r.droneType} sighting</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()} · {r.altitude}
                        </p>
                        {frzHits.length > 0 && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            <ShieldAlert className="size-3" />
                            Inside {frzHits[0].name} FRZ
                            {frzHits.length > 1 ? ` +${frzHits.length - 1}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                        meta.className,
                      )}
                    >
                      <VerdictIcon className="size-3.5" />
                      <span className="hidden sm:inline">{meta.label}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsPanel reports={reports} />
          </TabsContent>
        </Tabs>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Report detail</p>
              <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <ReportDetail
              report={selected}
              onSetStatus={(status, note) => handleSetStatus(selected.id, status, note)}
              onDelete={() => handleDeleteReport(selected.id)}
            />
          </div>
        </div>
      )}

      {decisionAck && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Decision recorded"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDecisionAck(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-border bg-card p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                "mx-auto flex size-12 items-center justify-center rounded-full",
                decisionAck.status === "confirmed"
                  ? "bg-foreground text-background"
                  : "bg-destructive text-destructive-foreground",
              )}
            >
              {decisionAck.status === "confirmed" ? (
                <ShieldCheck className="size-6" />
              ) : (
                <X className="size-6" />
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold">Thank you for reviewing</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Report <span className="font-mono text-foreground">{decisionAck.reference}</span> has
              been{" "}
              <span
                className={cn(
                  "font-medium",
                  decisionAck.status === "confirmed" ? "text-foreground" : "text-destructive",
                )}
              >
                {decisionAck.status === "confirmed" ? "confirmed as a drone" : "rejected"}
              </span>
              . Your decision and log have been recorded.
            </p>
            <Button className="mt-5 w-full" onClick={() => setDecisionAck(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({
  label,
  value,
  accent,
  danger,
}: {
  label: string
  value: number
  accent?: boolean
  danger?: boolean
}) {
  return (
    <Card className="p-4">
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          danger ? "text-destructive" : accent ? "text-accent" : "text-primary",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const meta: Record<ReportStatus, { label: string; className: string }> = {
    submitted: { label: "New", className: "bg-secondary text-muted-foreground border-border" },
    reviewing: { label: "Reviewing", className: "bg-accent/15 text-accent border-accent/40" },
    confirmed: { label: "Confirmed", className: "bg-chart-3/15 text-chart-3 border-chart-3/40" },
    rejected: {
      label: "Rejected",
      className: "bg-destructive/15 text-destructive border-destructive/40",
    },
  }
  const m = meta[status]
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", m.className)}>
      {m.label}
    </span>
  )
}
