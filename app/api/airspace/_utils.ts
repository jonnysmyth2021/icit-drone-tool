import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function requireApiUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { supabase, user: data.user }
}

export function numberParameter(value: string | null, name: string) {
  if (value === null || value.trim() === "") throw new Error(`${name} is required.`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a valid number.`)
  return parsed
}

export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Airspace request failed."
  return NextResponse.json({ error: message }, { status })
}
