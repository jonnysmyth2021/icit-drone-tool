"use client"

import type React from "react"

import Link from "next/link"
import { ChevronLeft, FileText } from "lucide-react"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"

export function StepShell({
  stepIndex,
  stepCount,
  eyebrow,
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  stepIndex: number
  stepCount: number
  eyebrow: string
  title: string
  subtitle?: string
  onBack?: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="reporter-theme flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-center px-5 pb-4 pt-5">
          <div className="flex justify-start">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex size-11 items-center justify-center rounded-xl border border-border bg-card/50 text-primary shadow-sm transition-colors hover:border-primary/60 hover:bg-secondary"
                aria-label="Go back"
              >
                <ChevronLeft className="size-6" strokeWidth={2.5} />
              </button>
            ) : (
              <Link
                href="/my-reports"
                className="flex size-11 items-center justify-center rounded-xl border border-border bg-card/50 text-primary shadow-sm transition-colors hover:border-primary/60 hover:bg-secondary"
                aria-label="View my reports"
              >
                <FileText className="size-5" />
              </Link>
            )}
          </div>
          <Brand className="reporter-brand" size="md" />
          <div className="flex items-center justify-end gap-2">
            <span className="reporter-theme-toggle flex size-11 items-center justify-center rounded-xl border border-border bg-card/50 text-foreground shadow-sm">
              <ThemeToggle />
            </span>
            <span className="flex h-11 min-w-14 items-center justify-center rounded-xl border border-border bg-card/50 px-3 font-mono text-sm font-semibold shadow-sm">
              <span className="text-primary">{stepIndex + 1}</span>
              <span className="text-muted-foreground">/{stepCount}</span>
            </span>
          </div>
        </div>
        <div
          className="mx-auto grid w-full max-w-lg gap-1.5 px-5 pb-4"
          style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: stepCount }, (_, index) => (
            <span
              key={index}
              className={
                index <= stepIndex
                  ? "h-1.5 rounded-full bg-primary transition-colors"
                  : "h-1.5 rounded-full bg-secondary transition-colors"
              }
            />
          ))}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-32 pt-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle ? (
          <p className="mt-4 max-w-md text-pretty text-base leading-7 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-8 flex-1">{children}</div>
      </div>

      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-background/94 backdrop-blur-xl">
          <div className="reporter-footer mx-auto w-full max-w-lg px-5 py-4">{footer}</div>
        </div>
      ) : null}
    </div>
  )
}
