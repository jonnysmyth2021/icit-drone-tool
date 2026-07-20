"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setSession } from "@/lib/store"
import { signInWithPassword } from "@/app/actions/auth"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setLoading(true)
    const result = await signInWithPassword(email, password)
    setLoading(false)

    if (!result.ok) {
      setError(
        result.missingConfig
          ? "Supabase is not configured yet. Use demo access until the project keys are added."
          : result.error,
      )
      return
    }

    setSession(result.session)
    router.push(result.session.role === "admin" ? "/review" : "/report")
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 0%, oklch(0.72 0.13 230 / 0.18), transparent 45%), radial-gradient(circle at 90% 100%, oklch(0.78 0.15 70 / 0.12), transparent 40%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <Brand />
        <span className="rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Restricted
        </span>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 pb-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <h1 className="text-balance text-2xl font-semibold tracking-tight">
              Drone Sighting Report
            </h1>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
              Log a sighting in seconds. Capture evidence, confirm location, and let
              ICIT triage the rest.
            </p>
          </div>

          <form
            onSubmit={signIn}
            className="rounded-xl border border-border bg-card/80 p-5 shadow-xl backdrop-blur"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@institution.ac.uk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Sign in
                <ArrowRight className="size-4" />
              </Button>
              {error ? (
                <p className="text-sm leading-relaxed text-destructive">{error}</p>
              ) : null}
            </div>
          </form>

        </div>
      </div>
    </main>
  )
}
