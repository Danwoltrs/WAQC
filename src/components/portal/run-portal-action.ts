// src/components/portal/run-portal-action.ts
import { toast } from 'sonner'

/**
 * One write from the staff Portal access card or the portal Team page: send
 * it, show the server's error or an email warning, reload on success.
 * `doFetch` is window.fetch on the staff card and the company-scoped portal
 * fetch on the Team page.
 */
export async function runPortalAction(
  doFetch: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  reload: () => Promise<void>,
): Promise<boolean> {
  const res = await doFetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    toast.error(json.error ?? 'That did not work')
    return false
  }
  if (json.emailSent === false) toast.warning('Saved, but the email could not be sent.')
  await reload()
  return true
}
