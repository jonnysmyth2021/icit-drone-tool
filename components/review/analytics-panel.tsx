"use client"

import type React from "react"
import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, CheckCircle2, Camera, Gauge, ShieldAlert, TrendingUp } from "lucide-react"

import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { zonesContaining } from "@/lib/uk-frz"
import { cn } from "@/lib/utils"
import type { DroneReport, Verdict } from "@/lib/types"

const VERDICT_LABELS: Record<Verdict, string> = {
  likely_drone: "Likely drone",
  possible_aircraft: "Possible aircraft",
  possible_astronomical: "Astronomical",
  inconclusive: "Inconclusive",
}

const VERDICT_COLOR: Record<Verdict, string> = {
  likely_drone: "var(--chart-3)",
  possible_aircraft: "var(--chart-2)",
  possible_astronomical: "var(--chart-1)",
  inconclusive: "var(--chart-5)",
}

export function AnalyticsPanel({ reports }: { reports: DroneReport[] }) {
  const a = useMemo(() => computeAnalytics(reports), [reports])

  if (reports.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-12 text-center">
        <Activity className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No data yet. Analytics appear once sightings are submitted.</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Total sightings" value={a.total} hint={`${a.last7} in last 7 days`} />
        <Kpi
          icon={CheckCircle2}
          label="Confirmed drones"
          value={a.confirmed}
          hint={`${a.confirmRate}% of reviewed`}
          tone="success"
        />
        <Kpi
          icon={Gauge}
          label="Avg. confidence"
          value={`${a.avgConfidence}%`}
          hint="Across assessed reports"
        />
        <Kpi
          icon={ShieldAlert}
          label="Inside FRZ"
          value={a.inFrz}
          hint={`${a.frzRate}% of located`}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sightings over time */}
        <ChartCard
          title="Sightings over time"
          subtitle="Daily submissions"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          <ChartContainer config={{ count: { label: "Sightings", color: "var(--chart-1)" } }} className="h-[240px] w-full">
            <AreaChart data={a.byDay} margin={{ left: -16, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="count"
                type="monotone"
                stroke="var(--color-count)"
                strokeWidth={2}
                fill="url(#fillCount)"
              />
            </AreaChart>
          </ChartContainer>
        </ChartCard>

        {/* Verdict breakdown */}
        <ChartCard title="Intelligence verdicts" subtitle="Automated triage outcome" icon={Activity}>
          <ChartContainer config={a.verdictConfig} className="mx-auto aspect-square h-[240px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
              <Pie data={a.byVerdict} dataKey="value" nameKey="name" innerRadius={55} strokeWidth={2}>
                {a.byVerdict.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} className="flex-wrap" />
            </PieChart>
          </ChartContainer>
        </ChartCard>

        {/* Review status */}
        <ChartCard title="Review status" subtitle="Queue progress" icon={CheckCircle2}>
          <ChartContainer config={a.statusConfig} className="h-[240px] w-full">
            <BarChart data={a.byStatus} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={80}
                fontSize={11}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" radius={5}>
                {a.byStatus.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Drone type */}
        <ChartCard title="Drone type reported" subtitle="Observer classification" icon={Activity}>
          <ChartContainer config={{ value: { label: "Sightings", color: "var(--chart-1)" } }} className="h-[240px] w-full">
            <BarChart data={a.byType} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} width={32} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={5} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Altitude band */}
        <ChartCard title="Altitude bands" subtitle="Reported height of sighting" icon={TrendingUp}>
          <ChartContainer config={{ value: { label: "Sightings", color: "var(--chart-2)" } }} className="h-[240px] w-full">
            <BarChart data={a.byAltitude} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={96}
                fontSize={11}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={5} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* FRZ table + evidence */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Most affected Flight Restriction Zones" subtitle="Sightings inside controlled airspace" icon={ShieldAlert}>
          {a.topFrz.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No sightings inside any FRZ.</p>
          ) : (
            <ul className="flex flex-col gap-2 py-1">
              {a.topFrz.map((z) => (
                <li key={z.name} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm">{z.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${(z.count / a.topFrz[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{z.count}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Evidence & lighting" subtitle="Report quality signals" icon={Camera}>
          <div className="grid grid-cols-2 gap-3 py-1">
            <MiniStat label="With evidence" value={`${a.evidenceRate}%`} sub={`${a.withEvidence}/${a.total} reports`} />
            <MiniStat label="Total media items" value={a.totalMedia} sub="photos + videos" />
            <MiniStat label="Lights visible" value={a.lightsYes} sub="reported with lights" />
            <MiniStat label="No / unknown lights" value={a.total - a.lightsYes} sub="dark or unsure" />
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function computeAnalytics(reports: DroneReport[]) {
  const total = reports.length
  const confirmed = reports.filter((r) => r.status === "confirmed").length
  const rejected = reports.filter((r) => r.status === "rejected").length
  const reviewed = confirmed + rejected
  const confirmRate = reviewed ? Math.round((confirmed / reviewed) * 100) : 0

  const assessed = reports.filter((r) => r.intelligence)
  const avgConfidence = assessed.length
    ? Math.round((assessed.reduce((s, r) => s + (r.intelligence?.confidence ?? 0), 0) / assessed.length) * 100)
    : 0

  const located = reports.filter((r) => r.location)
  const inFrz = located.filter((r) => zonesContaining(r.location).length > 0).length
  const frzRate = located.length ? Math.round((inFrz / located.length) * 100) : 0

  // Sightings over the last 14 days.
  const now = new Date()
  const byDay: { label: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const count = reports.filter((r) => r.createdAt.slice(0, 10) === key).length
    byDay.push({ label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count })
  }
  const last7 = reports.filter((r) => {
    const diff = (now.getTime() - new Date(r.createdAt).getTime()) / 86400000
    return diff <= 7
  }).length

  // Verdict breakdown.
  const verdicts: Verdict[] = ["likely_drone", "possible_aircraft", "possible_astronomical", "inconclusive"]
  const byVerdict = verdicts
    .map((v) => ({
      key: v,
      name: VERDICT_LABELS[v],
      value: reports.filter((r) => (r.intelligence?.verdict ?? "inconclusive") === v).length,
      color: VERDICT_COLOR[v],
    }))
    .filter((d) => d.value > 0)
  const verdictConfig: ChartConfig = Object.fromEntries(
    byVerdict.map((d) => [d.key, { label: d.name, color: d.color }]),
  )

  // Status breakdown.
  const statusDefs = [
    { key: "submitted", label: "New", color: "var(--chart-1)" },
    { key: "reviewing", label: "Reviewing", color: "var(--chart-2)" },
    { key: "confirmed", label: "Confirmed", color: "var(--chart-3)" },
    { key: "rejected", label: "Rejected", color: "var(--chart-4)" },
  ]
  const byStatus = statusDefs.map((s) => ({
    ...s,
    value: reports.filter((r) => r.status === s.key).length,
  }))
  const statusConfig: ChartConfig = Object.fromEntries(
    statusDefs.map((s) => [s.key, { label: s.label, color: s.color }]),
  )

  // Drone type.
  const types = ["Multi-Rotor", "Fixed Wing", "Unknown"] as const
  const byType = types.map((t) => ({ label: t, value: reports.filter((r) => r.droneType === t).length }))

  // Altitude band.
  const alts = [
    "Below Treeline",
    "Treeline Height",
    "Above Treeline",
    "Above Buildings",
    "High Altitude",
    "Unknown",
  ] as const
  const byAltitude = alts
    .map((al) => ({ label: al, value: reports.filter((r) => r.altitude === al).length }))
    .filter((d) => d.value > 0)

  // FRZ ranking.
  const frzCounts = new Map<string, number>()
  for (const r of located) {
    for (const z of zonesContaining(r.location)) {
      frzCounts.set(z.name, (frzCounts.get(z.name) ?? 0) + 1)
    }
  }
  const topFrz = [...frzCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 6)

  // Evidence + lighting.
  const withEvidence = reports.filter((r) => r.evidence.length > 0).length
  const evidenceRate = total ? Math.round((withEvidence / total) * 100) : 0
  const totalMedia = reports.reduce((s, r) => s + r.evidence.length, 0)
  const lightsYes = reports.filter((r) => r.lightsVisible === "Yes").length

  return {
    total,
    confirmed,
    rejected,
    confirmRate,
    avgConfidence,
    inFrz,
    frzRate,
    byDay,
    last7,
    byVerdict,
    verdictConfig,
    byStatus,
    statusConfig,
    byType,
    byAltitude,
    topFrz,
    withEvidence,
    evidenceRate,
    totalMedia,
    lightsYes,
  }
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  tone?: "success" | "danger"
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon
          className={cn(
            "size-4",
            tone === "success" ? "text-chart-3" : tone === "danger" ? "text-destructive" : "text-primary",
          )}
        />
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "success" ? "text-chart-3" : tone === "danger" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  className,
  children,
}: {
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <div>
          <h3 className="text-sm font-medium leading-none">{title}</h3>
          {subtitle && <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs font-medium">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
