import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type {
  Altitude,
  DroneType,
  EvidenceItem,
  IntelligenceAssessment,
  LightColor,
  LightsVisible,
  ReportLocation,
  ReportStatus,
} from "@/lib/types"

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reporter: text("reporter").notNull(),
  droneType: text("drone_type").$type<DroneType>().notNull(),
  lightsVisible: text("lights_visible").$type<LightsVisible>().notNull(),
  lightColors: jsonb("light_colors").$type<LightColor[]>().notNull().default([]),
  altitude: text("altitude").$type<Altitude>().notNull(),
  evidence: jsonb("evidence").$type<EvidenceItem[]>().notNull().default([]),
  location: jsonb("location").$type<ReportLocation | null>(),
  intelligence: jsonb("intelligence").$type<IntelligenceAssessment | null>(),
  status: text("status").$type<ReportStatus>().notNull().default("submitted"),
  reviewerNote: text("reviewer_note"),
})

export type ReportRow = typeof reports.$inferSelect
export type NewReportRow = typeof reports.$inferInsert
