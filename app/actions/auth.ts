"use server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { Session } from "@/lib/store"

type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; missingConfig?: boolean }

function roleFromMetadata(role: unknown): Session["role"] {
  return role === "admin" || role === "reviewer" ? "admin" : "observer"
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      missingConfig: true,
      error: "Supabase is not configured for this environment.",
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Unable to sign in." }
  }

  return {
    ok: true,
    session: {
      user: data.user.email ?? email,
      role: roleFromMetadata(data.user.app_metadata?.role),
      demo: false,
    },
  }
}

export async function signOut() {
  if (!isSupabaseConfigured()) return { ok: true }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return { ok: true }
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) return null

  return {
    user: data.user.email ?? data.user.id,
    role: roleFromMetadata(data.user.app_metadata?.role),
    demo: false,
  }
}
