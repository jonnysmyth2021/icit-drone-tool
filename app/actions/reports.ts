"use server"

import { desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { reports, type ReportRow } from "@/lib/db/schema"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { DroneReport, ReportStatus } from "@/lib/types"
import { getCurrentSession } from "./auth"

function rowToReport(row: ReportRow): DroneReport {
  return {
    id: row.id,
    reference: row.reference,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    reporter: row.reporter,
    droneType: row.droneType,
    lightsVisible: row.lightsVisible,
    lightColors: row.lightColors ?? [],
    altitude: row.altitude,
    evidence: row.evidence ?? [],
    location: row.location ?? null,
    intelligence: row.intelligence ?? null,
    status: row.status,
    reviewerNote: row.reviewerNote ?? undefined,
  } as DroneReport
}

export async function createReport(report: DroneReport): Promise<{ ok: boolean }> {
  const session = await getCurrentSession()
  if (isSupabaseConfigured() && !session) {
    throw new Error("You must be signed in to submit a report.")
  }

  await db.insert(reports).values({
    id: report.id,
    reference: report.reference,
    createdAt: report.createdAt ? new Date(report.createdAt) : new Date(),
    reporter: session?.user ?? report.reporter,
    droneType: report.droneType,
    lightsVisible: report.lightsVisible,
    lightColors: report.lightColors ?? [],
    altitude: report.altitude,
    evidence: report.evidence ?? [],
    location: report.location ?? null,
    intelligence: report.intelligence ?? null,
    status: report.status ?? "submitted",
    reviewerNote: report.reviewerNote ?? null,
  })
  return { ok: true }
}

export async function listReports(): Promise<DroneReport[]> {
  const session = await getCurrentSession()
  if (isSupabaseConfigured() && session?.role !== "admin") {
    throw new Error("Only reviewers can list submitted reports.")
  }

  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt))
  return rows.map(rowToReport)
}

export async function setReportStatus(
  id: string,
  status: ReportStatus,
  reviewerNote?: string,
): Promise<{ ok: boolean }> {
  const session = await getCurrentSession()
  if (isSupabaseConfigured() && session?.role !== "admin") {
    throw new Error("Only reviewers can update report status.")
  }

  await db
    .update(reports)
    .set({ status, ...(reviewerNote !== undefined ? { reviewerNote } : {}) })
    .where(eq(reports.id, id))
  return { ok: true }
}
