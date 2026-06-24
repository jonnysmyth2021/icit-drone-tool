import { AlertTriangle, CheckCircle2, HelpCircle, Plane, Sparkles } from "lucide-react"
import type { Verdict } from "@/lib/types"
import { cn } from "@/lib/utils"

export const VERDICT_META: Record<
  Verdict,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string; dot: string }
> = {
  likely_drone: {
    label: "Likely Drone",
    icon: CheckCircle2,
    className: "bg-chart-3/15 text-chart-3 border-chart-3/40",
    dot: "bg-chart-3",
  },
  possible_aircraft: {
    label: "Possible Aircraft",
    icon: Plane,
    className: "bg-accent/15 text-accent border-accent/40",
    dot: "bg-accent",
  },
  possible_astronomical: {
    label: "Possible Astronomical",
    icon: Sparkles,
    className: "bg-primary/15 text-primary border-primary/40",
    dot: "bg-primary",
  },
  inconclusive: {
    label: "Inconclusive",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const meta = VERDICT_META[verdict]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  )
}

export { AlertTriangle }
