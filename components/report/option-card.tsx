"use client"

import type React from "react"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function OptionCard({
  label,
  description,
  icon: Icon,
  selected,
  onClick,
}: {
  label: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all active:scale-[0.99]",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card/70 hover:border-primary/50 hover:bg-card",
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
            selected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-all",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-transparent",
        )}
      >
        <Check className="size-3.5" />
      </span>
    </button>
  )
}
