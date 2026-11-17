'use client'

import { useCallback, useState } from 'react'
import { parseCupperSensory, type CupperSensory, type RegionalProfile } from '@/lib/sensory'

export interface SensoryConfig {
  notesEnabled: boolean
  profile: RegionalProfile | null
}

const OFF: SensoryConfig = { notesEnabled: false, profile: null }

/** Per-sample sensory config (from the server) and this cupper's sensory answers. */
export function useSensoryCard() {
  const [configMap, setConfigMap] = useState<Record<string, SensoryConfig>>({})
  const [valueMap, setValueMap] = useState<Record<string, CupperSensory | null>>({})

  /**
   * Fetch every sample's config in parallel and publish it when it lands; a
   * failure leaves that sample all off. Never awaited by the page: a slow
   * config request must not delay the cupping screen.
   */
  const fetchConfigs = useCallback(async (sampleIds: string[]): Promise<void> => {
    const results = await Promise.allSettled(
      sampleIds.map(async (id) => {
        const res = await fetch(`/api/samples/${id}/sensory-config`)
        if (!res.ok) throw new Error('sensory-config failed')
        return (await res.json()) as SensoryConfig
      }),
    )
    const configs: Record<string, SensoryConfig> = {}
    sampleIds.forEach((id, i) => {
      const r = results[i]
      configs[id] = r.status === 'fulfilled' ? r.value : OFF
    })
    setConfigMap(configs)
  }, [])

  /** Seed this cupper's saved answers from the bulk scores. */
  const seedValues = useCallback((sampleIds: string[], savedScores: Record<string, { sensory?: unknown } | undefined>) => {
    const values: Record<string, CupperSensory | null> = {}
    for (const id of sampleIds) values[id] = parseCupperSensory(savedScores[id]?.sensory)
    setValueMap(values)
  }, [])

  const setValue = useCallback((sampleId: string, v: CupperSensory) => setValueMap((m) => ({ ...m, [sampleId]: v })), [])

  /** The save-body field for a sample, or undefined when neither setting is on. */
  const payloadFor = (sampleId: string): CupperSensory | undefined => {
    const c = configMap[sampleId]
    if (!c || (!c.notesEnabled && !c.profile)) return undefined
    return valueMap[sampleId] ?? { picks: [], profile_id: c.profile?.id ?? null, profile_match: null }
  }

  return { configMap, valueMap, fetchConfigs, seedValues, setValue, payloadFor }
}
