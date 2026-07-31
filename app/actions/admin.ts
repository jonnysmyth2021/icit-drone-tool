"use server"

import { revalidatePath } from "next/cache"

import { requireAuthContext } from "@/lib/auth/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type OrganisationStatus = "active" | "suspended"
export type AdminRole = "reporter" | "reviewer" | "super_admin"

async function requireSuperAdmin() {
  const auth = await requireAuthContext("platform.read")
  if (auth.context.role !== "super_admin") throw new Error("Super Admin access required.")
  return auth
}

async function audit(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  actor: Awaited<ReturnType<typeof requireSuperAdmin>>["context"],
  action: string,
  entity: string,
  entityId: string | null,
  organisationId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_logs").insert({
    organisation_id: organisationId,
    performed_by: actor.userId,
    action,
    entity,
    entity_id: entityId,
    metadata,
  })
  if (error) throw new Error(`Action completed but audit logging failed: ${error.message}`)
}

export async function getAdminDashboard() {
  const { supabase } = await requireSuperAdmin()
  const [
    organisations,
    profiles,
    reports,
    media,
    enrichments,
    audits,
    roles,
    permissions,
    settings,
  ] = await Promise.all([
    supabase.from("organisations").select("*").order("name"),
    supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, role, active, last_login, created_at, organisation_id, organisations(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select("id, organisation_id, status, created_at, submitted_at, reviewed_at"),
    supabase.from("report_media").select("organisation_id, file_size, created_at"),
    supabase.from("report_enrichment").select("organisation_id, created_at"),
    supabase
      .from("audit_logs")
      .select("id, organisation_id, performed_by, action, entity, entity_id, metadata, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("roles")
      .select("id, name, description, role_permissions(permission_id, permissions(id, key, description))")
      .order("name"),
    supabase.from("permissions").select("id, key, description").order("key"),
    supabase.from("platform_settings").select("*").eq("id", true).single(),
  ])

  for (const result of [organisations, profiles, reports, audits, roles, permissions, settings]) {
    if (result.error) throw new Error(result.error.message)
  }

  return {
    organisations: organisations.data ?? [],
    profiles: profiles.data ?? [],
    reports: reports.data ?? [],
    media: media.data ?? [],
    enrichments: enrichments.data ?? [],
    audits: audits.data ?? [],
    roles: roles.data ?? [],
    permissions: permissions.data ?? [],
    settings: settings.data,
    generatedAt: new Date().toISOString(),
  }
}

export async function createOrganisation(input: {
  name: string
  slug: string
  country: string
  licenceType: string
  expiresAt?: string
  storageLimitGb: number
  reportRetentionDays: number
  brandColour: string
  aiEnabled: boolean
  analyticsEnabled: boolean
  reviewRequired: boolean
}) {
  const { supabase, context } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from("organisations")
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      country: input.country.trim().toUpperCase(),
      licence_type: input.licenceType,
      expires_at: input.expiresAt || null,
      storage_limit_gb: input.storageLimitGb,
      report_retention_days: input.reportRetentionDays,
      brand_colour: input.brandColour,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(error?.message ?? "Unable to create organisation.")
  const { error: settingsError } = await supabase.from("organisation_settings").insert({
    organisation_id: data.id,
    ai_enabled: input.aiEnabled,
    analytics_enabled: input.analyticsEnabled,
    review_required: input.reviewRequired,
  })
  if (settingsError) {
    await supabase.from("organisations").delete().eq("id", data.id)
    throw new Error(`Unable to create organisation settings: ${settingsError.message}`)
  }
  await audit(supabase, context, "organisation.created", "organisation", data.id, data.id, {
    name: input.name,
  })
  revalidatePath("/admin")
  return { ok: true }
}

export async function setOrganisationStatus(id: string, status: OrganisationStatus) {
  const { supabase, context } = await requireSuperAdmin()
  if (id === context.organisationId && status === "suspended") {
    throw new Error("You cannot suspend your own organisation.")
  }
  const { error } = await supabase.from("organisations").update({ status }).eq("id", id)
  if (error) throw new Error(error.message)
  await audit(supabase, context, `organisation.${status}`, "organisation", id, id)
  revalidatePath("/admin")
  return { ok: true }
}

export async function updateOrganisation(input: {
  id: string
  name: string
  country: string
  licenceType: string
  expiresAt?: string
  storageLimitGb: number
  reportRetentionDays: number
  brandColour: string
}) {
  const { supabase, context } = await requireSuperAdmin()
  const { error } = await supabase
    .from("organisations")
    .update({
      name: input.name.trim(),
      country: input.country.trim().toUpperCase(),
      licence_type: input.licenceType,
      expires_at: input.expiresAt || null,
      storage_limit_gb: input.storageLimitGb,
      report_retention_days: input.reportRetentionDays,
      brand_colour: input.brandColour,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
  if (error) throw new Error(error.message)
  await audit(supabase, context, "organisation.updated", "organisation", input.id, input.id)
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteOrganisation(id: string) {
  const { supabase, context } = await requireSuperAdmin()
  if (id === context.organisationId) throw new Error("You cannot delete your own organisation.")
  const [{ count: users }, { count: reports }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("organisation_id", id),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("organisation_id", id),
  ])
  if ((users ?? 0) > 0 || (reports ?? 0) > 0) {
    throw new Error("Suspend this organisation instead. Organisations with users or reports cannot be deleted.")
  }
  const { error } = await supabase.from("organisations").delete().eq("id", id)
  if (error) throw new Error(error.message)
  await audit(supabase, context, "organisation.deleted", "organisation", id, context.organisationId)
  revalidatePath("/admin")
  return { ok: true }
}

export type CreateUserInput = {
  firstName: string
  lastName: string
  email: string
  password: string
  organisationId: string
  role: AdminRole
}

type AdminActionError = Error & { code?: string; status?: number }

function userCreationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/already (been )?registered|already exists|email.*exists/i.test(message)) {
    return "A user with this email address already exists."
  }
  if (/password/i.test(message)) return message
  if (/profile creation failed/i.test(message)) return message
  if (/organisation/i.test(message)) return message
  if (/super admin access|required|permission/i.test(message)) return message
  return "Unable to create the user. Check the server log for the Supabase error code."
}

async function createUserWithPasswordInternal(input: CreateUserInput) {
  const { supabase, context } = await requireSuperAdmin()
  if (input.password.length < 12) {
    throw new Error("The temporary password must contain at least 12 characters.")
  }

  const email = input.email.trim().toLowerCase()
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!email || !firstName || !lastName) {
    throw new Error("First name, last name and email are required.")
  }

  const { data: organisation, error: organisationError } = await supabase
    .from("organisations")
    .select("id, status")
    .eq("id", input.organisationId)
    .single()
  if (organisationError || !organisation) {
    throw new Error("The selected organisation no longer exists.")
  }
  if (organisation.status !== "active") {
    throw new Error("Activate the selected organisation before adding a user.")
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
    },
    app_metadata: {
      organisation_id: input.organisationId,
      role: input.role,
    },
  })
  if (error || !data.user) throw new Error(error?.message ?? "Unable to create user.")

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      organisation_id: input.organisationId,
      role: input.role,
      active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", data.user.id)
    .select("user_id")
    .single()

  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`User profile creation failed: ${profileError?.message ?? "profile record was not created"}`)
  }

  await audit(
    supabase,
    context,
    "user.created",
    "user",
    data.user.id,
    input.organisationId,
    { email, role: input.role },
  )
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function createUserWithPassword(
  input: CreateUserInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await createUserWithPasswordInternal(input)
  } catch (error) {
    const detail = error as AdminActionError
    console.error("[icit] super admin user creation failed", {
      name: detail?.name,
      message: detail?.message ?? String(error),
      code: detail?.code,
      status: detail?.status,
      stack: detail?.stack,
      emailDomain: input.email.includes("@") ? input.email.split("@").at(-1) : undefined,
      organisationId: input.organisationId,
      role: input.role,
    })
    return { ok: false, error: userCreationError(error) }
  }
}

export async function updateUser(input: {
  userId: string
  organisationId: string
  role: AdminRole
  active: boolean
}) {
  const { supabase, context } = await requireSuperAdmin()
  if (input.userId === context.userId && (!input.active || input.role !== "super_admin")) {
    throw new Error("You cannot disable or demote your own Super Admin account.")
  }
  const { error } = await supabase
    .from("profiles")
    .update({
      organisation_id: input.organisationId,
      role: input.role,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
  if (error) throw new Error(error.message)
  const admin = createAdminClient()
  const { error: metadataError } = await admin.auth.admin.updateUserById(input.userId, {
    app_metadata: { organisation_id: input.organisationId, role: input.role },
    ban_duration: input.active ? "none" : "876000h",
  })
  if (metadataError) throw new Error(metadataError.message)
  await audit(supabase, context, "user.updated", "user", input.userId, input.organisationId, {
    role: input.role,
    active: input.active,
  })
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteUser(userId: string) {
  const { supabase, context } = await requireSuperAdmin()
  if (userId === context.userId) throw new Error("You cannot delete your own account.")
  const { data: profile } = await supabase
    .from("profiles")
    .select("organisation_id, email")
    .eq("user_id", userId)
    .single()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
  await audit(
    supabase,
    context,
    "user.deleted",
    "user",
    userId,
    profile?.organisation_id ?? context.organisationId,
    { email: profile?.email },
  )
  revalidatePath("/admin")
  return { ok: true }
}

export async function sendPasswordReset(email: string) {
  const { supabase, context } = await requireSuperAdmin()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/`,
  })
  if (error) throw new Error(error.message)
  await audit(supabase, context, "user.password_reset_requested", "user", email, context.organisationId)
  return { ok: true }
}

export async function setRolePermissions(roleId: string, permissionIds: string[]) {
  const { supabase, context } = await requireSuperAdmin()
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .single()
  if (roleError || !role) throw new Error("Role not found.")
  if (role.name === "super_admin") throw new Error("Super Admin always retains every permission.")
  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId)
  if (deleteError) throw new Error(deleteError.message)
  if (permissionIds.length) {
    const { error: insertError } = await supabase.from("role_permissions").insert(
      permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })),
    )
    if (insertError) throw new Error(insertError.message)
  }
  await audit(supabase, context, "role.permissions_updated", "role", roleId, context.organisationId, {
    permissions: permissionIds,
  })
  revalidatePath("/admin")
  return { ok: true }
}

export async function updatePlatformSettings(input: {
  defaultReportRetentionDays: number
  defaultStorageGb: number
  globalAiEnabled: boolean
  maintenanceMode: boolean
}) {
  const { supabase, context } = await requireSuperAdmin()
  const { error } = await supabase
    .from("platform_settings")
    .update({
      default_report_retention_days: input.defaultReportRetentionDays,
      default_storage_gb: input.defaultStorageGb,
      global_ai_enabled: input.globalAiEnabled,
      maintenance_mode: input.maintenanceMode,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
  if (error) throw new Error(error.message)
  await audit(supabase, context, "platform.settings_updated", "platform_settings", "global", null)
  revalidatePath("/admin")
  return { ok: true }
}
