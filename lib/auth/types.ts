export type ApplicationRole = "reporter" | "reviewer" | "super_admin"

export interface AuthContext {
  userId: string
  email: string
  role: ApplicationRole
  organisationId: string
  organisationName: string
  organisationStatus: "active" | "suspended"
  permissions: string[]
  active: boolean
}

export function can(context: Pick<AuthContext, "permissions">, permission: string) {
  return context.permissions.includes(permission)
}
