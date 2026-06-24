"use client"

import { HelpCircle, Plane } from "lucide-react"
import { DroneGlyph } from "@/components/brand"
import type { DroneType } from "@/lib/types"
import { OptionCard } from "./option-card"
import { StepShell } from "./step-shell"

const OPTIONS: { value: DroneType; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    value: "Multi-Rotor",
    description: "Quadcopter or similar with multiple propellers, hovers in place.",
    icon: DroneGlyph,
  },
  {
    value: "Fixed Wing",
    description: "Aeroplane-style craft with wings, moves continuously forward.",
    icon: Plane,
  },
  {
    value: "Unknown",
    description: "Could not clearly identify the airframe type.",
    icon: HelpCircle,
  },
]

export function StepType({
  stepIndex,
  stepCount,
  value,
  onSelect,
}: {
  stepIndex: number
  stepCount: number
  value?: DroneType
  onSelect: (v: DroneType) => void
}) {
  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 1 — Identification"
      title="What do you see?"
      subtitle="Pick the closest match. We'll move on automatically."
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
