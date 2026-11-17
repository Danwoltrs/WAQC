import type { RegionalProfile } from './types'

/** How long a screen waits for a lot's sensory settings before treating them as off. */
export const SENSORY_CONFIG_TIMEOUT_MS = 8000

export interface FetchedSensoryConfig {
  notesEnabled: boolean
  profile: RegionalProfile | null
  profileConfigured: boolean
}

/**
 * GET /api/samples/<id>/sensory-config from the browser. Null on any failure:
 * a non-OK answer, a network error, a body that is not JSON, or no answer
 * within `timeoutMs` (the request is aborted). Callers settle null to all off,
 * so a hung request never blocks a screen (Finalize waits on this).
 */
export async function fetchSensoryConfig(
  sampleId: string,
  timeoutMs: number = SENSORY_CONFIG_TIMEOUT_MS,
): Promise<FetchedSensoryConfig | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, timeoutMs)
  })
  const read = (async (): Promise<FetchedSensoryConfig | null> => {
    try {
      const res = await fetch(`/api/samples/${sampleId}/sensory-config`, { signal: controller.signal })
      if (!res?.ok) return null
      const c = (await res.json()) as Partial<FetchedSensoryConfig> | null
      return {
        notesEnabled: c?.notesEnabled === true,
        profile: c?.profile ?? null,
        profileConfigured: c?.profileConfigured === true,
      }
    } catch {
      return null
    }
  })()
  try {
    // The timer also wins when a fetch ignores the abort signal.
    return await Promise.race([read, timedOut])
  } finally {
    clearTimeout(timer)
  }
}
