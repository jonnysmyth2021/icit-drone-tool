import Link from "next/link"
import { ArrowLeft, FileText, Plus } from "lucide-react"

import { listMyReports } from "@/app/actions/reports"
import { Brand } from "@/components/brand"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getAuthContext } from "@/lib/auth/server"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function MyReportsPage() {
  const auth = await getAuthContext()
  if (!auth) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <Link href="/" className={buttonVariants()}>Sign in</Link>
      </main>
    )
  }
  const reports = await listMyReports()

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            <Brand size="sm" />
            <span className="text-sm text-muted-foreground">My Reports</span>
          </div>
          <Link href="/report" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" /> New report
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-7">
        <Link href="/report" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to reporting
        </Link>
        <h1 className="text-2xl font-semibold">Submitted reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reports submitted by {auth.context.email} for {auth.context.organisationName}.
        </p>
        <div className="mt-6 grid gap-3">
          {reports.length ? reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-5" /></span>
                  <div><p className="font-mono text-sm font-medium">{report.reference}</p><p className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()} · {report.droneType}</p></div>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize">{report.status}</span>
              </CardContent>
            </Card>
          )) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No reports submitted yet.</CardContent></Card>
          )}
        </div>
      </section>
    </main>
  )
}
