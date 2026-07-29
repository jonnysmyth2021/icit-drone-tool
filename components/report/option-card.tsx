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
        "group flex min-h-28 w-full items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition-all active:scale-[0.99] sm:gap-5 sm:p-5",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card/45 hover:border-primary/60 hover:bg-card/70",
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors sm:size-16",
          )}
        >
          <Icon className="size-7" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
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
