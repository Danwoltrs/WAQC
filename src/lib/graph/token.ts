/**
 * Microsoft Graph token fetcher.
 *
 * Ported from sys.wolthers.com — same client-credentials (app-only) auth
 * pattern, same tenant + app registration, same .default scope. The
 * Mail.Send application permission granted on the app registration is what
 * enables /sendMail calls against any mailbox in the tenant (in WAQC's case,
 * qualitycontrol@wolthers.com).
 *
 * Token is cached in-memory per serverless instance; Vercel routes reuse the
 * instance for several minutes so cache hit rate is high without Redis.
 */

const TOKEN_ENDPOINT = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

interface TokenCache {
  access_token: string
  expires_at: number // epoch ms
}

let tokenCache: TokenCache | null = null

export async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET',
    )
  }

  // Reuse the cached token if it has more than 60 s of life left.
  if (tokenCache && tokenCache.expires_at - Date.now() > 60_000) {
    return tokenCache.access_token
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(TOKEN_ENDPOINT(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph token fetch failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  tokenCache = {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
  }
  return json.access_token
}
