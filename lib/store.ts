"use client"

import type { DroneReport } from "./types"

const REPORTS_KEY = "icit-drone-reports"
const SESSION_KEY = "icit-drone-session"

export interface Session {
  user: string
  role: "observer" | "admin"
  demo: boolean
}

/* ---------------------------------- auth ---------------------------------- */

export function getSession(): Session | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(session: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY)
}

/* --------------------------------- reports -------------------------------- */

export function getReports(): DroneReport[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(REPORTS_KEY)
    const list = raw ? (JSON.parse(raw) as DroneReport[]) : []
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export function saveReport(report: DroneReport) {
  const reports = getReports().filter((r) => r.id !== report.id)
  reports.unshift(report)
  persist(reports)
}

export function updateReport(id: string, patch: Partial<DroneReport>) {
  const reports = getReports().map((r) => (r.id === id ? { ...r, ...patch } : r))
  persist(reports)
}

function persist(reports: DroneReport[]) {
  try {
    window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports))
  } catch {
    // Likely quota exceeded from large media previews — drop previews and retry.
    const trimmed = reports.map((r) => ({
      ...r,
      evidence: r.evidence.map((e) => ({ ...e, preview: e.kind === "photo" ? e.preview : "" })),
    }))
    try {
      window.localStorage.setItem(REPORTS_KEY, JSON.stringify(trimmed))
    } catch {
      // Give up gracefully.
    }
  }
}

/* -------------------------------- utilities ------------------------------- */

export function makeReference(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ICIT-${stamp}-${rand}`
}
