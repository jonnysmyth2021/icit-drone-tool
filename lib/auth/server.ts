import "server-only"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import type { AuthContext } from "./types"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getAuthContext(
  supabase?: SupabaseClient,
): Promise<{ supabase: SupabaseClient; context: AuthContext } | null> {
  const client = supabase ?? (await createClient())
  const { data: auth, error: authError } = await client.auth.getUser()
  if (authError || !auth.user) return null

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("user_id, email, role, organisation_id, active, organisations(name, status)")
    .eq("user_id", auth.user.id)
    .single()
  if (profileError || !profile) return null

  const { data: role } = await client
    .from("roles")
    .select("role_permissions(permissions(key))")
    .eq("name", profile.role)
    .single()

  const organisation = Array.isArray(profile.organisations)
    ? profile.organisations[0]
    : profile.organisations
  const assignments = role?.role_permissions ?? []
  const permissions = assignments
    .map((assignment) => {
      const value = Array.isArray(assignment.permissions)
        ? assignment.permissions[0]
        : assignment.permissions
      return value?.key
    })
    .filter((key): key is string => typeof key === "string")

  return {
    supabase: client,
    context: {
      userId: auth.user.id,
      email: profile.email ?? auth.user.email ?? auth.user.id,
      role: profile.role as AuthContext["role"],
      organisationId: profile.organisation_id,
      organisationName: organisation?.name ?? "Organisation",
      organisationStatus: organisation?.status === "suspended" ? "suspended" : "active",
      permissions,
      active: profile.active,
    },
  }
}

export async function requireAuthContext(permission?: string) {
  const auth = await getAuthContext()
  if (!auth) throw new Error("Authentication required.")
  if (!auth.context.active) throw new Error("This account is disabled.")
  if (auth.context.organisationStatus !== "active" && auth.context.role !== "super_admin") {
    throw new Error("This organisation is suspended.")
  }
  if (permission && !auth.context.permissions.includes(permission)) {
    throw new Error("You do not have permission to perform this action.")
  }
  return auth
}

export async function requirePageRole(role: AuthContext["role"]) {
  const auth = await getAuthContext()
  if (!auth) redirect("/")
  if (!auth.context.active || auth.context.organisationStatus !== "active") redirect("/")
  if (auth.context.role !== role) redirect("/report")
  return auth
}
