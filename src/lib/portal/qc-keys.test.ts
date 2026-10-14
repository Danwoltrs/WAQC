// src/lib/portal/qc-keys.test.ts
import { describe, expect, it } from 'vitest'
import {
  QC_CAPABILITIES, QC_MANAGE_USERS, QC_PRESETS, QC_VIEWS, clampQcKeys, hasQcView, isCompanyAdmin, isQcKey,
  normalizeQcKeys, qcKeysOf,
} from './qc-keys'

describe('registry', () => {
  it('lists the QC views and capabilities', () => {
    expect(QC_VIEWS).toEqual([
      'qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_supplier_review', 'qc_reports', 'qc_specs', 'qc_cupping',
    ])
    expect(QC_CAPABILITIES).toEqual(['qc_spec_edit', 'qc_cupping_score'])
  })

  it('owns its own company-admin key, outside the grantable capabilities', () => {
    expect(QC_MANAGE_USERS).toBe('qc_manage_users')
    expect(QC_CAPABILITIES as readonly string[]).not.toContain(QC_MANAGE_USERS)
  })

  it('has presets that only use registry keys and never an admin key', () => {
    for (const preset of QC_PRESETS) {
      expect(normalizeQcKeys(preset.keys)).toEqual(preset.keys)
      expect(preset.keys.capabilities as string[]).not.toContain('qc_manage_users')
      expect(preset.keys.capabilities as string[]).not.toContain('manage_users')
    }
    expect(QC_PRESETS.map((p) => p.key)).toEqual(['full', 'cupper', 'viewer'])
  })
})

describe('isQcKey', () => {
  it('is the qc_ prefix, the admin key included', () => {
    expect(isQcKey('qc_samples')).toBe(true)
    expect(isQcKey('qc_manage_users')).toBe(true)
    expect(isQcKey('manage_users')).toBe(false)
    expect(isQcKey('samples')).toBe(false)
  })
})

describe('normalizeQcKeys', () => {
  it('keeps known QC keys in registry order without duplicates and drops everything else', () => {
    expect(normalizeQcKeys({
      views: ['qc_reports', 'contracts', 'qc_samples', 'qc_samples', 42, 'qc_unknown'],
      capabilities: ['manage_users', 'qc_manage_users', 'qc_cupping_score', 'fixation_request'],
    })).toEqual({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] })
  })

  it('treats a non-array as empty', () => {
    expect(normalizeQcKeys({ views: 'qc_samples', capabilities: null })).toEqual({ views: [], capabilities: [] })
  })
})

describe('clampQcKeys', () => {
  it('intersects with the ceiling', () => {
    expect(clampQcKeys(
      { views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_spec_edit'] },
      { views: ['qc_samples', 'contracts'], capabilities: ['qc_manage_users'] },
    )).toEqual({ views: ['qc_samples'], capabilities: [] })
  })

  it('never yields an admin key, even when the ceiling holds it', () => {
    const requested = { views: [], capabilities: ['qc_manage_users', 'manage_users'] } as any
    expect(clampQcKeys(requested, { capabilities: ['qc_manage_users', 'manage_users'] }).capabilities).toEqual([])
  })

  it('treats a missing ceiling as empty', () => {
    expect(clampQcKeys({ views: ['qc_samples'], capabilities: [] }, {})).toEqual({ views: [], capabilities: [] })
  })
})

describe('grant readers', () => {
  const grant = { views: ['contracts', 'qc_samples'], capabilities: ['manage_users', 'qc_manage_users', 'qc_cupping_score'] }

  it('reads the grantable QC keys of a grant, never the admin key', () => {
    expect(qcKeysOf(grant)).toEqual({ views: ['qc_samples'], capabilities: ['qc_cupping_score'] })
  })

  it('needs a QC view, not just a QC capability, to open the portal', () => {
    expect(hasQcView(grant)).toBe(true)
    expect(hasQcView({ views: ['contracts'], capabilities: ['qc_spec_edit'] })).toBe(false)
    expect(hasQcView({ views: null, capabilities: null })).toBe(false)
  })

  it('knows a QC company admin by qc_manage_users only', () => {
    expect(isCompanyAdmin(grant)).toBe(true)
    expect(isCompanyAdmin({ capabilities: ['manage_users', 'qc_spec_edit'] })).toBe(false)
    expect(isCompanyAdmin({ capabilities: null })).toBe(false)
  })
})
