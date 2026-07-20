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
    return { token: cachedToken.value, configured: true, status: "ok" }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
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
    if (!res.ok) {
      return { token: null, configured: true, status: `http_${res.status}` }
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) {
      return { token: null, configured: true, status: "invalid_response" }
    }
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000,
    }
    return { token: cachedToken.value, configured: true, status: "ok" }
  } catch (error) {
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
  try {
    const res = await fetch(`${STATES_URL}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      return {
        states: null,
        authenticated: Boolean(token),
        credentialsConfigured: tokenResult.configured,
        authenticationStatus: tokenResult.status,
      }
    }
    const data = await res.json()
    return {
      states: Array.isArray(data?.states) ? (data.states as unknown[][]) : null,
      authenticated: Boolean(token),
      credentialsConfigured: tokenResult.configured,
      authenticationStatus: tokenResult.status,
    }
  } catch {
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
