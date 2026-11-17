import { describe, it, expect, vi, beforeEach } from 'vitest'

const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { loadSampleSensoryConfig } from './load-config'

const dbWith = (result: { data: any; error: any }) => ({
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => result }
    return chain
  },
})

const resolved = (custom: any, template: any = {}, methodology: string | null = null) => ({
  custom_parameters: custom,
  template: { parameters: template, methodology },
})

describe('loadSampleSensoryConfig', () => {
  beforeEach(() => spec.resolveSampleSpec.mockReset())

  it('is all off for a quality with both settings off', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({}))
    expect(await loadSampleSensoryConfig(dbWith({ data: null, error: null }) as any, 's1')).toEqual({ notesEnabled: false, profile: null, profileConfigured: false })
  })

  it('notes on, no profile: profileConfigured is false', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({ sensory_notes_enabled: true }))
    expect(await loadSampleSensoryConfig(dbWith({ data: null, error: null }) as any, 's1')).toEqual({ notesEnabled: true, profile: null, profileConfigured: false })
  })

  it('is all off when there is no spec', async () => {
    spec.resolveSampleSpec.mockResolvedValue(null)
    expect(await loadSampleSensoryConfig(dbWith({ data: null, error: null }) as any, 's1')).toEqual({ notesEnabled: false, profile: null, profileConfigured: false })
  })

  it('is all off for a CVA quality', async () => {
    spec.resolveSampleSpec.mockResolvedValue(
      resolved({ sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'P' } }, {}, 'cva'),
    )
    expect(await loadSampleSensoryConfig(dbWith({ data: null, error: null }) as any, 's1')).toEqual({ notesEnabled: false, profile: null, profileConfigured: false })
  })

  it('returns the full profile row, inactive included', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({ sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'P' } }))
    const row = { id: 'p1', name: 'P', origin: 'Brazil', region: 'Cerrado', notes: [['Sweet', 'Brown Sugar'], ['bad']], description: null, is_active: false }
    const cfg = await loadSampleSensoryConfig(dbWith({ data: row, error: null }) as any, 's1')
    expect(cfg.notesEnabled).toBe(true)
    expect(cfg.profileConfigured).toBe(true)
    expect(cfg.profile).toEqual({ ...row, notes: [['Sweet', 'Brown Sugar']] })
  })

  it('a profile id whose row no longer exists is no profile at all (finalize is never blocked by it)', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({ sensory_notes_enabled: true, regional_profile: { id: 'gone', name: 'P' } }))
    const cfg = await loadSampleSensoryConfig(dbWith({ data: null, error: null }) as any, 's1')
    expect(cfg).toEqual({ notesEnabled: true, profile: null, profileConfigured: false })
  })

  it('a stored id that is not a uuid (22P02) is no profile either', async () => {
    spec.resolveSampleSpec.mockResolvedValue(resolved({ regional_profile: { id: 'cerrado', name: 'P' } }))
    const cfg = await loadSampleSensoryConfig(dbWith({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } }) as any, 's1')
    expect(cfg).toEqual({ notesEnabled: false, profile: null, profileConfigured: false })
  })

  it('a read error keeps the profile configured (callers answer 503, not "no profile")', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    spec.resolveSampleSpec.mockResolvedValue(resolved({ regional_profile: { id: 'p1', name: 'P' } }))
    const cfg = await loadSampleSensoryConfig(dbWith({ data: null, error: { code: '57014', message: 'timeout' } }) as any, 's1')
    expect(cfg).toEqual({ notesEnabled: false, profile: null, profileConfigured: true })
    warn.mockRestore()
  })

  it('has no profile when the table is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    spec.resolveSampleSpec.mockResolvedValue(resolved({ regional_profile: { id: 'p1', name: 'P' } }))
    const cfg = await loadSampleSensoryConfig(dbWith({ data: null, error: { code: '42P01', message: 'x' } }) as any, 's1')
    expect(cfg.profile).toBeNull()
    expect(cfg.profileConfigured).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
