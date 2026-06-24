"use client"

import exifr from "exifr"
import type { EvidenceItem } from "./types"

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/** Downscale an image file to a compressed JPEG data URL for preview/storage. */
async function makeImagePreview(file: File, maxSize = 1100): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return ""
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.toDataURL("image/jpeg", 0.62)
}

/** Grab a poster frame and basic metadata from a video file. */
async function readVideo(
  file: File,
): Promise<{ preview: string; metadata: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.src = url
    const cleanup = () => URL.revokeObjectURL(url)

    video.onloadedmetadata = () => {
      const metadata: Record<string, unknown> = {
        durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      video.currentTime = Math.min(0.2, video.duration || 0)
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = video.videoWidth || 320
          canvas.height = video.videoHeight || 180
          const ctx = canvas.getContext("2d")
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
          const scaled = document.createElement("canvas")
          const scale = Math.min(1, 480 / Math.max(canvas.width, canvas.height))
          scaled.width = Math.round(canvas.width * scale)
          scaled.height = Math.round(canvas.height * scale)
          scaled.getContext("2d")?.drawImage(canvas, 0, 0, scaled.width, scaled.height)
          const preview = scaled.toDataURL("image/jpeg", 0.6)
          cleanup()
          resolve({ preview, metadata })
        } catch {
          cleanup()
          resolve({ preview: "", metadata })
        }
      }
    }
    video.onerror = () => {
      cleanup()
      resolve({ preview: "", metadata: {} })
    }
  })
}

/** Best-effort current geolocation, used to enrich camera captures that strip EXIF. */
export async function getCurrentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    )
  })
}

export async function processFile(
  file: File,
  source: "camera" | "upload",
): Promise<EvidenceItem> {
  const isVideo = file.type.startsWith("video")
  const base: EvidenceItem = {
    id: uid(),
    kind: isVideo ? "video" : "photo",
    preview: "",
    fileName: file.name || (isVideo ? "capture.mp4" : "capture.jpg"),
    mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
    sizeBytes: file.size,
    source,
    capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
    metadata: {},
  }

  if (isVideo) {
    const { preview, metadata } = await readVideo(file)
    base.preview = preview
    base.metadata = metadata
  } else {
    const [preview, exif] = await Promise.all([
      makeImagePreview(file),
      exifr.parse(file, { gps: true, tiff: true, exif: true }).catch(() => null),
    ])
    base.preview = preview
    if (exif) {
      base.metadata = {
        make: exif.Make,
        model: exif.Model,
        lens: exif.LensModel,
        dateTimeOriginal: exif.DateTimeOriginal,
        fNumber: exif.FNumber,
        exposureTime: exif.ExposureTime,
        iso: exif.ISO,
        focalLength: exif.FocalLength,
        gpsLatitude: exif.latitude,
        gpsLongitude: exif.longitude,
        gpsAltitude: exif.GPSAltitude,
        orientation: exif.Orientation,
      }
    }
  }

  // For camera captures with no embedded GPS, enrich with live geolocation.
  const hasGps = base.metadata.gpsLatitude != null && base.metadata.gpsLongitude != null
  if (source === "camera" && !hasGps) {
    const pos = await getCurrentPosition()
    if (pos) {
      base.metadata.capturedLatitude = pos.coords.latitude
      base.metadata.capturedLongitude = pos.coords.longitude
      base.metadata.capturedAccuracyM = pos.coords.accuracy
      base.metadata.gpsSource = "device-geolocation"
    }
  }

  return base
}
