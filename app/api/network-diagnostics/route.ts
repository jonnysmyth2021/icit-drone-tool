import { lookup } from "node:dns/promises"
import { connect } from "node:tls"
import type { LookupAddress } from "node:dns"

export const dynamic = "force-dynamic"

const HOSTS = ["www.google.com", "api.github.com", "auth.opensky-network.org"] as const
const CONNECT_TIMEOUT_MS = 12_000

type NetworkError = Error & {
  code?: string
  errno?: string | number
  syscall?: string
  address?: string
  port?: number
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) }

  const networkError = error as NetworkError
  return {
    name: error.name,
    message: error.message,
    code: networkError.code,
    errno: networkError.errno,
    syscall: networkError.syscall,
    address: networkError.address,
    port: networkError.port,
    stack: error.stack,
    cause: error.cause == null ? undefined : serializeError(error.cause),
  }
}

async function diagnoseHost(hostname: (typeof HOSTS)[number]) {
  const startedAt = performance.now()
  const dnsStartedAt = performance.now()

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch (error) {
    return {
      hostname,
      dns: {
        success: false,
        durationMs: Number((performance.now() - dnsStartedAt).toFixed(1)),
        error: serializeError(error),
      },
      tcp: { success: false, attempted: false },
      tls: { success: false, attempted: false },
      totalDurationMs: Number((performance.now() - startedAt).toFixed(1)),
    }
  }

  const dnsDurationMs = performance.now() - dnsStartedAt
  const target = addresses.find((address) => address.family === 4) ?? addresses[0]
  const connectionStartedAt = performance.now()

  return new Promise<Record<string, unknown>>((resolve) => {
    let settled = false
    let tcpConnectedAt: number | null = null

    const finish = (result: Record<string, unknown>) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      resolve({
        hostname,
        dns: {
          success: true,
          durationMs: Number(dnsDurationMs.toFixed(1)),
          addresses,
          selectedAddress: target,
        },
        ...result,
        totalDurationMs: Number((performance.now() - startedAt).toFixed(1)),
      })
    }

    const socket = connect({
      host: target.address,
      port: 443,
      servername: hostname,
      rejectUnauthorized: true,
    })

    const timeout = setTimeout(() => {
      const error = new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS}ms`) as NetworkError
      error.name = "ConnectionTimeoutError"
      error.code = "ETIMEDOUT"
      error.address = target.address
      error.port = 443
      socket.destroy(error)
    }, CONNECT_TIMEOUT_MS)

    socket.once("connect", () => {
      tcpConnectedAt = performance.now()
    })

    socket.once("secureConnect", () => {
      const completedAt = performance.now()
      finish({
        tcp: {
          success: true,
          attempted: true,
          durationMs: Number(((tcpConnectedAt ?? completedAt) - connectionStartedAt).toFixed(1)),
        },
        tls: {
          success: true,
          attempted: true,
          durationMs: Number((completedAt - (tcpConnectedAt ?? connectionStartedAt)).toFixed(1)),
          protocol: socket.getProtocol(),
          cipher: socket.getCipher(),
          authorized: socket.authorized,
          authorizationError: socket.authorizationError,
        },
      })
    })

    socket.once("error", (error) => {
      const failedAt = performance.now()
      finish({
        failurePhase: tcpConnectedAt == null ? "tcp_connection" : "tls_handshake",
        tcp: {
          success: tcpConnectedAt != null,
          attempted: true,
          durationMs: Number(
            ((tcpConnectedAt ?? failedAt) - connectionStartedAt).toFixed(1),
          ),
        },
        tls: {
          success: false,
          attempted: tcpConnectedAt != null,
          durationMs:
            tcpConnectedAt == null
              ? undefined
              : Number((failedAt - tcpConnectedAt).toFixed(1)),
        },
        error: serializeError(error),
      })
    })
  })
}

export async function GET() {
  const results = await Promise.all(HOSTS.map(diagnoseHost))

  return Response.json(
    {
      diagnostic: "raw-dns-tcp-tls",
      generatedAt: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.env.NETLIFY ? "netlify" : process.env.VERCEL ? "vercel" : "other",
        region: process.env.AWS_REGION ?? process.env.VERCEL_REGION ?? null,
      },
      timeoutMs: CONNECT_TIMEOUT_MS,
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
