import { describe, expect, it } from 'vitest'
import { firstVisibleHref, visibleNav } from './portal-nav'
import { QC_PRESETS } from '@/lib/portal/qc-keys'

describe('visibleNav', () => {
  it('gives a Viewer Overview, Certificates and Containers', () => {
    const viewer = QC_PRESETS.find((p) => p.key === 'viewer')!.keys
    expect(visibleNav({ keys: viewer, isCompanyAdmin: false }).map((i) => i.label)).toEqual(['Overview', 'Certificates', 'Containers'])
  })

  it('shows Team only to company admins, and every tab to Full', () => {
    const full = QC_PRESETS.find((p) => p.key === 'full')!.keys
    expect(visibleNav({ keys: full, isCompanyAdmin: true }).map((i) => i.label))
      .toEqual(['Overview', 'Certificates', 'Suppliers', 'Containers', 'Team'])
  })

  it('leaves Overview out without qc_dashboard and lands on the first visible page', () => {
    const items = visibleNav({ keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false })
    expect(items.map((i) => i.label)).toEqual(['Certificates'])
    expect(firstVisibleHref(items)).toBe('/portal/certificates')
  })
})
