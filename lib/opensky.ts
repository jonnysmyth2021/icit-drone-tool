// Shared OpenSky Network access.
//
// As of March 2026 OpenSky requires OAuth2 client-credentials for usable rate
// limits (anonymous access is throttled to near-zero). Provide credentials via
// OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET to enable authenticated requests;
// without them we fall back to the (rate-limited) anonymous endpoint.

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
const STATES_URL = "https://opensky-network.org/api/states/all"

let cachedToken: { value: string; expiresAt: number } | null = null

function logOpenSky(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ service: "opensky", event, ...details }))
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) }

  const cause = error.cause as
    | (Error & {
        code?: unknown
        errno?: unknown
        syscall?: unknown
        address?: unknown
        port?: unknown
      })
    | undefined
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

function redactOAuthBody(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    for (const key of ["access_token", "refresh_token", "id_token", "client_secret"]) {
      if (key in parsed) parsed[key] = "[REDACTED]"
    }
    return parsed
  } catch {
    return body.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
  }
}

type TokenResult = {
  token: string | null
  configured: boolean
  status: "ok" | "not_configured" | "timeout" | "network_error" | `http_${number}` | "invalid_response"
}

async function getAccessToken(): Promise<TokenResult> {
  const id = process.env.OPENSKY_CLIENT_ID
  const secret = process.env.OPENSKY_CLIENT_SECRET
  if (!id || !secret) {
    return { token: null, configured: false, status: "not_configured" }
  }

  // Reuse a cached token until ~60s before expiry.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    logOpenSky("oauth_token_cache_hit", { expiresAt: new Date(cachedToken.expiresAt).toISOString() })
    return { token: cachedToken.value, configured: true, status: "ok" }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let responseBody: string | undefined
  try {
    logOpenSky("oauth_request", {
      url: TOKEN_URL,
      method: "POST",
      credentialsConfigured: true,
    })
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
    })
    responseBody = await res.text()
    logOpenSky("oauth_response", {
      url: TOKEN_URL,
      status: res.status,
      body: redactOAuthBody(responseBody),
    })
    if (!res.ok) {
      return { token: null, configured: true, status: `http_${res.status}` }
    }
    const data = JSON.parse(responseBody) as { access_token?: string; expires_in?: number }
    if (!data.access_token) {
      return { token: null, configured: true, status: "invalid_response" }
    }
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000,
    }
    return { token: cachedToken.value, configured: true, status: "ok" }
  } catch (error) {
    console.error(
      JSON.stringify({
        service: "opensky",
        event: "oauth_exception",
        url: TOKEN_URL,
        responseBody: responseBody ? redactOAuthBody(responseBody) : undefined,
        error: serializeError(error),
      }),
    )
    return {
      token: null,
      configured: true,
      status: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
    }
  } finally {
    clearTimeout(timeout)
  }
}

export interface OpenSkyResult {
  states: unknown[][] | null
  authenticated: boolean
  credentialsConfigured: boolean
  authenticationStatus: TokenResult["status"]
}

/** Fetch raw OpenSky state vectors for a bounding box. */
export async function fetchOpenSkyStates(
  bbox: { lamin: number; lomin: number; lamax: number; lomax: number },
  timeoutMs = 8000,
): Promise<OpenSkyResult> {
  const tokenResult = await getAccessToken()
  const token = tokenResult.token
  const params = new URLSearchParams({
    lamin: String(bbox.lamin),
    lomin: String(bbox.lomin),
    lamax: String(bbox.lamax),
    lomax: String(bbox.lomax),
  })

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  const requestUrl = `${STATES_URL}?${params.toString()}`
  let responseBody: string | undefined
  try {
    logOpenSky("aircraft_request", {
      url: requestUrl,
      authorizationHeaderSent: Boolean(token),
      authenticationStatus: tokenResult.status,
    })
    const res = await fetch(requestUrl, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    responseBody = await res.text()
    logOpenSky("aircraft_response", {
      url: requestUrl,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      bodyLength: Buffer.byteLength(responseBody, "utf8"),
    })
    if (!res.ok) {
      return {
        states: null,
        authenticated: Boolean(token),
        credentialsConfigured: tokenResult.configured,
        authenticationStatus: tokenResult.status,
      }
    }
    const data = JSON.parse(responseBody) as { states?: unknown }
    const states = Array.isArray(data.states) ? (data.states as unknown[][]) : null
    logOpenSky("aircraft_parsed", { count: states?.length ?? 0 })
    return {
      states,
      authenticated: Boolean(token),
      credentialsConfigured: tokenResult.configured,
      authenticationStatus: tokenResult.status,
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        service: "opensky",
        event: "aircraft_exception",
        url: requestUrl,
        responseBody,
        error: serializeError(error),
      }),
    )
    return {
      states: null,
      authenticated: Boolean(token),
      credentialsConfigured: tokenResult.configured,
      authenticationStatus: tokenResult.status,
    }
  } finally {
    clearTimeout(t)
  }
}
