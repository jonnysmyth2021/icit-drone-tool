import type { AircraftProviderName, AircraftProviderStatus } from "./types"

type ErrorWithNetworkDetails = Error & {
  code?: unknown
  errno?: unknown
  syscall?: unknown
  address?: unknown
  port?: unknown
}

export function serializeProviderError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) }
  const cause = error.cause as ErrorWithNetworkDetails | undefined
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      cause instanceof Error
        ? {
            name: cause.name,
            message: cause.message,
            code: cause.code,
            errno: cause.errno,
            syscall: cause.syscall,
            address: cause.address,
            port: cause.port,
            stack: cause.stack,
          }
        : cause == null
          ? undefined
          : String(cause),
  }
}

export function networkErrorCode(error: unknown) {
  if (!(error instanceof Error)) return undefined
  const direct = (error as ErrorWithNetworkDetails).code
  const cause = (error.cause as ErrorWithNetworkDetails | undefined)?.code
  const value = cause ?? direct
  return typeof value === "string" ? value : undefined
}

export function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false
  const code = networkErrorCode(error)
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT"
  )
}

export function providerLog(
  provider: AircraftProviderName,
  request: string,
  details: {
    durationMs: number
    status: AircraftProviderStatus
    timeout: boolean
    httpStatus?: number
    fallbackTriggered: boolean
    attempt?: number
    error?: unknown
  },
) {
  const payload = {
    service: "aircraft",
    event: "provider_request",
    provider,
    request,
    ...details,
  }
  const line = JSON.stringify(payload)
  if (details.status === "success") console.info(line)
  else console.error(line)
}

export function configuredTimeout(name: string, fallbackMs: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 1_000 && value <= 30_000 ? value : fallbackMs
}
