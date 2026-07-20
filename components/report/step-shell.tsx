"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, LayoutDashboard } from "lucide-react"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/store"

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
  const router = useRouter()
  const [isReviewer, setIsReviewer] = useState(false)
  const pct = Math.round(((stepIndex + 1) / stepCount) * 100)

  useEffect(() => {
    setIsReviewer(getSession()?.role === "admin")
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
          <div className="flex justify-start">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Go back"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : (
              <span className="size-9" />
            )}
          </div>
          <Brand size="sm" />
          <div className="flex justify-end">
            {isReviewer ? (
              <Button variant="ghost" size="sm" onClick={() => router.push("/review")}>
                <LayoutDashboard className="size-4" />
                Dashboard
              </Button>
            ) : (
              <span className="w-9 text-right font-mono text-xs text-muted-foreground">
                {stepIndex + 1}/{stepCount}
              </span>
            )}
          </div>
        </div>
        <div className="h-0.5 w-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-28 pt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-6 flex-1">{children}</div>
      </div>

      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
          <div className="mx-auto w-full max-w-md px-4 py-3">{footer}</div>
        </div>
      ) : null}
    </div>
  )
}
