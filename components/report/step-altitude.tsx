"use client"

import { Building2, HelpCircle, MoveDown, MoveUp, Trees, Plane } from "lucide-react"
import type { Altitude } from "@/lib/types"
import { OptionCard } from "./option-card"
import { StepShell } from "./step-shell"

const OPTIONS: { value: Altitude; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "Below Treeline", description: "Lower than surrounding trees.", icon: MoveDown },
  { value: "Treeline Height", description: "Roughly level with the treetops.", icon: Trees },
  { value: "Above Treeline", description: "Clearly above the trees.", icon: MoveUp },
  { value: "Above Buildings", description: "Higher than nearby rooftops.", icon: Building2 },
  { value: "High Altitude", description: "Very high — small or distant.", icon: Plane },
  { value: "Unknown", description: "Could not judge the height.", icon: HelpCircle },
]

export function StepAltitude({
  stepIndex,
  stepCount,
  value,
  onSelect,
  onBack,
}: {
  stepIndex: number
  stepCount: number
  value?: Altitude
  onSelect: (v: Altitude) => void
  onBack: () => void
}) {
  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 3 — Altitude"
      title="Approximate altitude"
      subtitle="Your best estimate of how high the craft was flying."
      onBack={onBack}
    >
      <div className="flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.value}
            label={o.value}
            description={o.description}
            icon={o.icon}
            selected={value === o.value}
            onClick={() => onSelect(o.value)}
          />
        ))}
      </div>
    </StepShell>
  )
}
