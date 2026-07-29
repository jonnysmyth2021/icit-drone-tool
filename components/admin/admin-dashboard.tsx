"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  BarChart3,
  Building2,
  Database,
  FileClock,
  FileText,
  KeyRound,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  createOrganisation,
  createUserWithPassword,
  deleteOrganisation,
  deleteUser,
  inviteUser,
  sendPasswordReset,
  setOrganisationStatus,
  setRolePermissions,
  updateOrganisation,
  updatePlatformSettings,
  updateUser,
  type AdminRole,
  type getAdminDashboard,
} from "@/app/actions/admin"
import { signOut } from "@/app/actions/auth"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { clearSession } from "@/lib/store"
import { cn } from "@/lib/utils"

type DashboardData = Awaited<ReturnType<typeof getAdminDashboard>>

const roleLabels: Record<AdminRole, string> = {
  reporter: "Reporter",
  reviewer: "Reviewer",
  super_admin: "Super Admin",
}

function organisationName(value: unknown) {
  const item = Array.isArray(value) ? value[0] : value
  return item && typeof item === "object" && "name" in item ? String(item.name) : "Unknown"
}

export function AdminDashboard({
  initialData,
  currentUserId,
}: {
  initialData: DashboardData
  currentUserId: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [editingOrganisationId, setEditingOrganisationId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const organisations = initialData.organisations
  const profiles = initialData.profiles
  const reports = initialData.reports
  const media = initialData.media
  const now = new Date(initialData.generatedAt).getTime()
  const today = initialData.generatedAt.slice(0, 10)
  const storageBytes = media.reduce((sum, row) => sum + Number(row.file_size ?? 0), 0)
  const pendingReviews = reports.filter((row) =>
    ["submitted", "Pending", "reviewing"].includes(row.status ?? ""),
  ).length
  const activeSessions = profiles.filter(
    (profile) =>
      profile.last_login && now - new Date(profile.last_login).getTime() < 24 * 60 * 60 * 1000,
  ).length
  const expiredUsers = new Set(
    organisations
      .filter((org) => org.expires_at && new Date(org.expires_at).getTime() < now)
      .map((org) => org.id),
  )

  const stats = [
    { label: "Active organisations", value: organisations.filter((o) => o.status === "active").length, icon: Building2 },
    { label: "Total users", value: profiles.length, icon: Users },
    { label: "Reports today", value: reports.filter((r) => r.created_at.startsWith(today)).length, icon: FileText },
    { label: "Pending reviews", value: pendingReviews, icon: FileClock },
    { label: "Storage used", value: formatBytes(storageBytes), icon: Database },
    { label: "AI requests", value: initialData.enrichments.length, icon: Activity },
    { label: "Active sessions", value: activeSessions, icon: ShieldCheck },
    { label: "Expired pilots", value: profiles.filter((p) => expiredUsers.has(p.organisation_id)).length, icon: UserCog },
  ]

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return profiles
    return profiles.filter((profile) =>
      `${profile.first_name ?? ""} ${profile.last_name ?? ""} ${profile.email} ${profile.role} ${organisationName(profile.organisations)}`
        .toLowerCase()
        .includes(needle),
    )
  }, [profiles, query])

  function mutate(task: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await task()
        toast.success(success)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed.")
      }
    })
  }

  async function logout() {
    await signOut()
    clearSession()
    router.replace("/")
  }

  return (
    <main className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <Brand size="sm" />
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Super Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push("/review")}>
              Review Queue
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview" orientation="vertical" className="min-h-[calc(100svh-57px)] md:grid md:grid-cols-[230px_1fr]">
        <aside className="border-b border-border bg-card/40 p-4 md:border-b-0 md:border-r">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent md:flex">
            {[
              ["overview", "Overview", BarChart3],
              ["organisations", "Organisations", Building2],
              ["users", "Users", Users],
              ["roles", "Roles & Permissions", KeyRound],
              ["usage", "Usage", Activity],
              ["audit", "Audit Logs", FileClock],
              ["settings", "Platform Settings", Settings],
            ].map(([value, label, Icon]) => (
              <TabsTrigger key={String(value)} value={String(value)} className="justify-start px-3 py-2">
                <Icon className="size-4" />
                {String(label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <section className="min-w-0 p-4 md:p-7">
          <TabsContent value="overview">
            <PageHeading title="Platform overview" description={`Live platform position as of ${new Date(initialData.generatedAt).toLocaleString()}.`} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="mt-2 text-2xl font-semibold">{value}</p>
                    </div>
                    <span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="size-5" /></span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ActivityChart reports={reports} generatedAt={initialData.generatedAt} />
              <OrganisationActivity data={initialData} />
            </div>
          </TabsContent>

          <TabsContent value="organisations">
            <PageHeading title="Organisations" description="Manage licences, capacity and tenant lifecycle." />
            <CreateOrganisationForm disabled={pending} onSubmit={(input) => mutate(() => createOrganisation(input), "Organisation created.")} />
            {editingOrganisationId ? (
              <EditOrganisationForm
                organisation={organisations.find((organisation) => organisation.id === editingOrganisationId)!}
                disabled={pending}
                onCancel={() => setEditingOrganisationId(null)}
                onSubmit={(input) => mutate(
                  async () => {
                    await updateOrganisation(input)
                    setEditingOrganisationId(null)
                  },
                  "Organisation updated.",
                )}
              />
            ) : null}
            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>{["Organisation", "Status", "Country", "Users", "Reports", "Storage", "Licence", "Expiry", "Actions"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {organisations.map((org) => {
                    const userCount = profiles.filter((p) => p.organisation_id === org.id).length
                    const reportCount = reports.filter((r) => r.organisation_id === org.id).length
                    const bytes = media.filter((m) => m.organisation_id === org.id).reduce((sum, m) => sum + Number(m.file_size ?? 0), 0)
                    return (
                      <tr key={org.id} className="border-t border-border">
                        <td className="px-4 py-3"><p className="font-medium">{org.name}</p><p className="text-xs text-muted-foreground">{org.slug}</p></td>
                        <td className="px-4 py-3"><StatusPill active={org.status === "active"} label={org.status} /></td>
                        <td className="px-4 py-3">{org.country}</td>
                        <td className="px-4 py-3">{userCount}</td>
                        <td className="px-4 py-3">{reportCount}</td>
                        <td className="px-4 py-3">{formatBytes(bytes)} / {org.storage_limit_gb} GB</td>
                        <td className="px-4 py-3 capitalize">{org.licence_type}</td>
                        <td className="px-4 py-3">{org.expires_at ? new Date(org.expires_at).toLocaleDateString() : "No expiry"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditingOrganisationId(org.id)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="secondary" disabled={pending} onClick={() => mutate(() => setOrganisationStatus(org.id, org.status === "active" ? "suspended" : "active"), org.status === "active" ? "Organisation suspended." : "Organisation activated.")}>
                              {org.status === "active" ? "Suspend" : "Activate"}
                            </Button>
                            <Button size="icon-sm" variant="ghost" disabled={pending || userCount > 0 || reportCount > 0} onClick={() => confirm(`Delete ${org.name}?`) && mutate(() => deleteOrganisation(org.id), "Organisation deleted.")}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <PageHeading title="Users" description="Invite personnel and manage tenant, role and account status." />
            <InviteUserForm organisations={organisations} disabled={pending} onSubmit={(input) => mutate(() => inviteUser({ ...input, redirectTo: `${window.location.origin}/` }), "Invitation sent.")} />
            <CreateUserForm
              organisations={organisations}
              disabled={pending}
              onSubmit={(input) =>
                mutate(() => createUserWithPassword(input), "User created and ready to sign in.")
              }
            />
            <div className="relative mt-5 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" className="pl-9" />
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>{["Name", "Email", "Organisation", "Role", "Status", "Last login", "Actions"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredUsers.map((profile) => (
                    <UserRow
                      key={profile.user_id}
                      profile={profile}
                      organisations={organisations}
                      currentUserId={currentUserId}
                      disabled={pending}
                      onSave={(input) => mutate(() => updateUser(input), "User updated.")}
                      onReset={() => mutate(() => sendPasswordReset(profile.email), "Password reset email sent.")}
                      onDelete={() => confirm(`Delete ${profile.email}?`) && mutate(() => deleteUser(profile.user_id), "User deleted.")}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="roles">
            <PageHeading title="Roles & permissions" description="Database-backed permission assignments used by RLS and server authorization." />
            <div className="grid gap-4 xl:grid-cols-3">
              {initialData.roles.map((role) => (
                <RoleCard key={role.id} role={role} permissions={initialData.permissions} disabled={pending} onSave={(ids) => mutate(() => setRolePermissions(role.id, ids), "Role permissions updated.")} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="usage">
            <PageHeading title="Usage" description="Operational consumption and review performance by organisation." />
            <div className="grid gap-4 lg:grid-cols-2">
              {organisations.map((org) => {
                const orgReports = reports.filter((r) => r.organisation_id === org.id)
                const orgMedia = media.filter((m) => m.organisation_id === org.id)
                const reviewed = orgReports.filter((r) => r.reviewed_at && r.submitted_at)
                const averageReviewHours = reviewed.length ? reviewed.reduce((sum, r) => sum + (new Date(r.reviewed_at!).getTime() - new Date(r.submitted_at!).getTime()) / 3_600_000, 0) / reviewed.length : 0
                return (
                  <Card key={org.id}>
                    <CardHeader><CardTitle>{org.name}</CardTitle><CardDescription>{org.licence_type} licence</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                      <UsageMetric label="Reports" value={orgReports.length} />
                      <UsageMetric label="Evidence uploads" value={orgMedia.length} />
                      <UsageMetric label="Storage" value={formatBytes(orgMedia.reduce((sum, m) => sum + Number(m.file_size ?? 0), 0))} />
                      <UsageMetric label="Average review" value={reviewed.length ? `${averageReviewHours.toFixed(1)}h` : "—"} />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <PageHeading title="Audit logs" description="Immutable record of important administrative and operational changes." />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Timestamp", "User", "Action", "Target", "Organisation", "IP address"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
                <tbody>
                  {initialData.audits.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3">{profiles.find((profile) => profile.user_id === entry.performed_by)?.email ?? "System"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                      <td className="px-4 py-3">{entry.entity}{entry.entity_id ? ` · ${entry.entity_id}` : ""}</td>
                      <td className="px-4 py-3">{organisations.find((o) => o.id === entry.organisation_id)?.name ?? "Platform"}</td>
                      <td className="px-4 py-3">{entry.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <PageHeading title="Platform settings" description="Global defaults and operational controls." />
            {initialData.settings ? (
              <PlatformSettingsForm settings={initialData.settings} disabled={pending} onSubmit={(input) => mutate(() => updatePlatformSettings(input), "Platform settings updated.")} />
            ) : null}
          </TabsContent>
        </section>
      </Tabs>
    </main>
  )
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize", active ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive")}>{label}</span>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function ActivityChart({ reports, generatedAt }: { reports: DashboardData["reports"]; generatedAt: string }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(generatedAt)
    date.setDate(date.getDate() - (13 - index))
    const key = date.toISOString().slice(0, 10)
    return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), value: reports.filter((r) => r.created_at.startsWith(key)).length }
  })
  const max = Math.max(1, ...days.map((day) => day.value))
  return (
    <Card><CardHeader><CardTitle>Reports over time</CardTitle><CardDescription>Last 14 days</CardDescription></CardHeader><CardContent>
      <div className="flex h-48 items-end gap-2">{days.map((day) => <div key={day.key} className="flex flex-1 flex-col items-center gap-2"><span className="text-[10px] text-muted-foreground">{day.value}</span><div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(4, (day.value / max) * 140)}px` }} /><span className="text-[9px] text-muted-foreground">{day.label}</span></div>)}</div>
    </CardContent></Card>
  )
}

function OrganisationActivity({ data }: { data: DashboardData }) {
  return (
    <Card><CardHeader><CardTitle>Organisation activity</CardTitle><CardDescription>Report volume by tenant</CardDescription></CardHeader><CardContent className="space-y-4">
      {data.organisations.map((org) => {
        const count = data.reports.filter((report) => report.organisation_id === org.id).length
        const max = Math.max(1, ...data.organisations.map((item) => data.reports.filter((r) => r.organisation_id === item.id).length))
        return <div key={org.id}><div className="mb-1 flex justify-between text-xs"><span>{org.name}</span><span className="text-muted-foreground">{count}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} /></div></div>
      })}
    </CardContent></Card>
  )
}

function CreateOrganisationForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: Parameters<typeof createOrganisation>[0]) => void }) {
  return (
    <Card><CardHeader><CardTitle>Create new organisation</CardTitle><CardDescription>Provision a tenant and its default settings.</CardDescription></CardHeader><CardContent>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onSubmit({
          name: String(data.get("name")), slug: String(data.get("slug")), country: String(data.get("country")),
          licenceType: String(data.get("licenceType")), expiresAt: String(data.get("expiresAt") ?? ""),
          storageLimitGb: Number(data.get("storageLimitGb")), reportRetentionDays: Number(data.get("retention")),
          brandColour: String(data.get("brandColour")), aiEnabled: data.get("aiEnabled") === "on",
          analyticsEnabled: data.get("analyticsEnabled") === "on", reviewRequired: data.get("reviewRequired") === "on",
        })
      }}>
        <Field label="Name"><Input name="name" placeholder="e.g. Belfast International Airport" required /></Field>
        <Field label="Slug"><Input name="slug" placeholder="e.g. belfast-international-airport" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></Field>
        <Field label="Country"><Input name="country" defaultValue="GB" placeholder="e.g. GB" required /></Field>
        <Field label="Licence"><Input name="licenceType" defaultValue="enterprise" placeholder="e.g. enterprise" required /></Field>
        <Field label="Expiry"><Input name="expiresAt" type="date" aria-label="e.g. 31 December 2027" /></Field>
        <Field label="Storage limit (GB)"><Input name="storageLimitGb" type="number" min="1" defaultValue="10" placeholder="e.g. 10" required /></Field>
        <Field label="Retention (days)"><Input name="retention" type="number" min="1" defaultValue="2555" placeholder="e.g. 2555" required /></Field>
        <Field label="Brand colour"><Input name="brandColour" type="color" defaultValue="#f97316" aria-label="e.g. burnt orange" /></Field>
        <label className="flex items-center gap-2"><input name="aiEnabled" type="checkbox" defaultChecked /> Enable AI</label><label className="flex items-center gap-2"><input name="analyticsEnabled" type="checkbox" defaultChecked /> Enable analytics</label><label className="flex items-center gap-2"><input name="reviewRequired" type="checkbox" defaultChecked /> Review workflow</label>
        <Button type="submit" disabled={disabled}><Plus className="size-4" />Create organisation</Button>
      </form>
    </CardContent></Card>
  )
}

function InviteUserForm({ organisations, disabled, onSubmit }: { organisations: DashboardData["organisations"]; disabled: boolean; onSubmit: (input: { email: string; organisationId: string; role: AdminRole }) => void }) {
  return (
    <Card><CardHeader><CardTitle>Invite user</CardTitle><CardDescription>Invitation metadata securely assigns tenant and role.</CardDescription></CardHeader><CardContent>
      <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget)
        onSubmit({ email: String(data.get("email")), organisationId: String(data.get("organisationId")), role: String(data.get("role")) as AdminRole })
      }}>
        <Input name="email" type="email" placeholder="e.g. officer@organisation.gov.uk" required />
        <select name="organisationId" className="h-9 rounded-md border border-input bg-background px-3" required>{organisations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
        <select name="role" className="h-9 rounded-md border border-input bg-background px-3">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <Button type="submit" disabled={disabled}>Send invite</Button>
      </form>
    </CardContent></Card>
  )
}

function CreateUserForm({
  organisations,
  disabled,
  onSubmit,
}: {
  organisations: DashboardData["organisations"]
  disabled: boolean
  onSubmit: (input: Parameters<typeof createUserWithPassword>[0]) => void
}) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Create user with password</CardTitle>
        <CardDescription>
          Creates an active, email-confirmed account. Share the temporary password securely.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            onSubmit({
              firstName: String(data.get("firstName")),
              lastName: String(data.get("lastName")),
              email: String(data.get("email")),
              password: String(data.get("password")),
              organisationId: String(data.get("organisationId")),
              role: String(data.get("role")) as AdminRole,
            })
          }}
        >
          <Field label="First name">
            <Input name="firstName" autoComplete="off" placeholder="e.g. Jane" required />
          </Field>
          <Field label="Last name">
            <Input name="lastName" autoComplete="off" placeholder="e.g. Smith" required />
          </Field>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="off"
              placeholder="e.g. jane.smith@organisation.gov.uk"
              required
            />
          </Field>
          <Field label="Temporary password">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              placeholder="Minimum 12 characters"
              required
            />
          </Field>
          <Field label="Organisation">
            <select
              name="organisationId"
              className="h-9 w-full rounded-md border border-input bg-background px-3"
              required
            >
              {organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select
              name="role"
              className="h-9 w-full rounded-md border border-input bg-background px-3"
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" disabled={disabled}>
              <Plus className="size-4" />
              Create user
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function EditOrganisationForm({ organisation, disabled, onCancel, onSubmit }: {
  organisation: DashboardData["organisations"][number]
  disabled: boolean
  onCancel: () => void
  onSubmit: (input: Parameters<typeof updateOrganisation>[0]) => void
}) {
  return (
    <Card className="mt-4 border-primary/30">
      <CardHeader><CardTitle>Edit {organisation.name}</CardTitle><CardDescription>Update licence, limits and organisation identity.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          onSubmit({
            id: organisation.id,
            name: String(data.get("name")),
            country: String(data.get("country")),
            licenceType: String(data.get("licenceType")),
            expiresAt: String(data.get("expiresAt") ?? ""),
            storageLimitGb: Number(data.get("storageLimitGb")),
            reportRetentionDays: Number(data.get("retention")),
            brandColour: String(data.get("brandColour")),
          })
        }}>
          <Field label="Name"><Input name="name" defaultValue={organisation.name} required /></Field>
          <Field label="Country"><Input name="country" defaultValue={organisation.country} required /></Field>
          <Field label="Licence"><Input name="licenceType" defaultValue={organisation.licence_type} required /></Field>
          <Field label="Expiry"><Input name="expiresAt" type="date" defaultValue={organisation.expires_at?.slice(0, 10) ?? ""} /></Field>
          <Field label="Storage limit (GB)"><Input name="storageLimitGb" type="number" min="1" defaultValue={organisation.storage_limit_gb} required /></Field>
          <Field label="Retention (days)"><Input name="retention" type="number" min="1" defaultValue={organisation.report_retention_days} required /></Field>
          <Field label="Brand colour"><Input name="brandColour" type="color" defaultValue={organisation.brand_colour} /></Field>
          <div className="flex items-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={disabled}>Save changes</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

function UserRow({ profile, organisations, currentUserId, disabled, onSave, onReset, onDelete }: {
  profile: DashboardData["profiles"][number]; organisations: DashboardData["organisations"]; currentUserId: string; disabled: boolean;
  onSave: (input: Parameters<typeof updateUser>[0]) => void; onReset: () => void; onDelete: () => void
}) {
  const [role, setRole] = useState<AdminRole>(profile.role as AdminRole)
  const [organisationId, setOrganisationId] = useState(profile.organisation_id)
  return <tr className="border-t border-border">
    <td className="px-4 py-3">{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed user"}</td><td className="px-4 py-3">{profile.email}</td>
    <td className="px-4 py-3"><select value={organisationId} onChange={(e) => setOrganisationId(e.target.value)} className="rounded border border-input bg-background px-2 py-1">{organisations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></td>
    <td className="px-4 py-3"><select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className="rounded border border-input bg-background px-2 py-1">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
    <td className="px-4 py-3"><StatusPill active={profile.active} label={profile.active ? "active" : "disabled"} /></td><td className="px-4 py-3">{profile.last_login ? new Date(profile.last_login).toLocaleString() : "Never"}</td>
    <td className="px-4 py-3"><div className="flex gap-1"><Button size="sm" variant="secondary" disabled={disabled} onClick={() => onSave({ userId: profile.user_id, organisationId, role, active: profile.active })}>Save</Button><Button size="sm" variant="ghost" disabled={disabled || profile.user_id === currentUserId} onClick={() => onSave({ userId: profile.user_id, organisationId, role, active: !profile.active })}>{profile.active ? "Disable" : "Enable"}</Button><Button size="icon-sm" variant="ghost" disabled={disabled} onClick={onReset}><KeyRound className="size-4" /></Button><Button size="icon-sm" variant="ghost" disabled={disabled || profile.user_id === currentUserId} onClick={onDelete}><Trash2 className="size-4" /></Button></div></td>
  </tr>
}

function RoleCard({ role, permissions, disabled, onSave }: { role: DashboardData["roles"][number]; permissions: DashboardData["permissions"]; disabled: boolean; onSave: (ids: string[]) => void }) {
  const available = permissions
  const [selected, setSelected] = useState(role.role_permissions.map((rp) => rp.permission_id))
  const locked = role.name === "super_admin"
  return <Card><CardHeader><CardTitle className="capitalize">{String(role.name).replace("_", " ")}</CardTitle><CardDescription>{role.description}</CardDescription></CardHeader><CardContent className="space-y-2">
    {available.map((permission) => <label key={permission.id} className="flex gap-2 text-xs"><input type="checkbox" checked={locked || selected.includes(permission.id)} disabled={locked} onChange={(e) => setSelected((current) => e.target.checked ? [...current, permission.id] : current.filter((id) => id !== permission.id))} /><span><strong className="font-mono">{permission.key}</strong><br/><span className="text-muted-foreground">{permission.description}</span></span></label>)}
    <Button className="mt-3 w-full" disabled={disabled || locked} onClick={() => onSave(selected)}>Save permissions</Button>
  </CardContent></Card>
}

function UsageMetric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label>{label}</Label>{children}</div> }

function PlatformSettingsForm({ settings, disabled, onSubmit }: { settings: NonNullable<DashboardData["settings"]>; disabled: boolean; onSubmit: (input: Parameters<typeof updatePlatformSettings>[0]) => void }) {
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Global controls</CardTitle><CardDescription>Defaults apply to newly provisioned tenants.</CardDescription></CardHeader><CardContent>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSubmit({ defaultReportRetentionDays: Number(data.get("retention")), defaultStorageGb: Number(data.get("storage")), globalAiEnabled: data.get("ai") === "on", maintenanceMode: data.get("maintenance") === "on" }) }}>
      <Field label="Default retention (days)"><Input name="retention" type="number" min="1" defaultValue={settings.default_report_retention_days} /></Field><Field label="Default storage (GB)"><Input name="storage" type="number" min="1" defaultValue={settings.default_storage_gb} /></Field>
      <label className="flex items-center gap-2"><input name="ai" type="checkbox" defaultChecked={settings.global_ai_enabled} /> Global AI enabled</label><label className="flex items-center gap-2"><input name="maintenance" type="checkbox" defaultChecked={settings.maintenance_mode} /> Maintenance mode</label><Button type="submit" disabled={disabled}>Save platform settings</Button>
    </form>
  </CardContent></Card>
}
