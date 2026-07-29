"use server"

import { createClient } from "@/lib/supabase/server"
import { getAuthContext } from "@/lib/auth/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { Session } from "@/lib/store"

type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; missingConfig?: boolean }

function toSession(context: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>["context"]): Session {
  return {
    user: context.email,
    role: context.role,
    organisationId: context.organisationId,
    organisationName: context.organisationName,
    permissions: context.permissions,
    demo: false,
  }
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

  const auth = await getAuthContext(supabase)
  if (!auth || !auth.context.active) {
    await supabase.auth.signOut()
    return { ok: false, error: "This account is not active or has no organisation assignment." }
  }
  if (auth.context.organisationStatus !== "active" && auth.context.role !== "super_admin") {
    await supabase.auth.signOut()
    return { ok: false, error: "This organisation is currently suspended." }
  }
  await supabase
    .from("profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("user_id", data.user.id)

  return {
    ok: true,
    session: toSession(auth.context),
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
  const auth = await getAuthContext(supabase)
  return auth ? toSession(auth.context) : null
}
