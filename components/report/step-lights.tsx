"use client"

import { CircleSlash, HelpCircle, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type LightColor, LIGHT_COLOR_OPTIONS, type LightsVisible } from "@/lib/types"
import { cn } from "@/lib/utils"
import { OptionCard } from "./option-card"
import { StepShell } from "./step-shell"

const OPTIONS: { value: LightsVisible; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "Yes", description: "Lights were clearly visible on the craft.", icon: Lightbulb },
  { value: "No", description: "No lights observed.", icon: CircleSlash },
  { value: "Unknown", description: "Unsure or could not tell.", icon: HelpCircle },
]

export function StepLights({
  stepIndex,
  stepCount,
  value,
  colors,
  onSelect,
  onToggleColor,
  onContinue,
  onBack,
}: {
  stepIndex: number
  stepCount: number
  value?: LightsVisible
  colors: LightColor[]
  onSelect: (v: LightsVisible) => void
  onToggleColor: (c: LightColor) => void
  onContinue: () => void
  onBack: () => void
}) {
  const showColors = value === "Yes"
  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 2 — Lighting"
      title="Lights visible?"
      subtitle={
        showColors
          ? "Select every colour you saw. These help distinguish drones from aircraft."
          : "If you saw lights, you can describe their colours next."
      }
      onBack={onBack}
      footer={
        showColors ? (
          <Button className="w-full" onClick={onContinue}>
            Continue
          </Button>
        ) : undefined
      }
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

      {showColors ? (
        <div className="mt-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Describe the lights
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {LIGHT_COLOR_OPTIONS.map((c) => {
              const active = colors.includes(c.value)
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onToggleColor(c.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm transition-all active:scale-[0.98]",
                    active
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border bg-card/70 hover:border-primary/50",
                  )}
                >
                  <span
                    className="size-4 shrink-0 rounded-full ring-1 ring-black/30"
                    style={{ backgroundColor: c.swatch }}
                  />
                  <span className="font-medium text-foreground">{c.value}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </StepShell>
  )
}
