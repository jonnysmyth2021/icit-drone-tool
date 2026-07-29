import { getAdminDashboard } from "@/app/actions/admin"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { requirePageRole } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const { context } = await requirePageRole("super_admin")
  const data = await getAdminDashboard()
  return <AdminDashboard initialData={data} currentUserId={context.userId} />
}
