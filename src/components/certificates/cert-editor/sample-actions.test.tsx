import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/components/providers/auth-provider', () => ({ useAuth: () => ({ profile: null }) }))

const composerProps = vi.fn()
vi.mock('@/components/certificates/batch-approval-send-view', () => ({
  BatchApprovalSendView: (props: unknown) => { composerProps(props); return null },
}))
vi.mock('./use-sample-actions', () => ({
  useSampleActions: () => ({
    showApprovalSend: true, setShowApprovalSend: vi.fn(),
    emailRecipients: { exporter: false, importer: false, roaster: false },
  }),
}))

import { SampleActionsMenu } from './sample-actions'
import type { CertSample } from './use-cert-editor'

const sample = { id: 's-1', status: 'approved', wolthers_contract_nr: '41999/26' } as unknown as CertSample

describe('SampleActionsMenu — send approval email', () => {
  it('opens the shared seller-email composer for this one certificate when it has no group loaded', () => {
    composerProps.mockClear()
    render(<SampleActionsMenu sample={sample} reload={vi.fn()} onClose={vi.fn()} />)
    expect(composerProps).toHaveBeenCalledWith(expect.objectContaining({
      open: true,
      selection: { sampleIds: ['s-1'], parties: ['buyer', 'seller'], includeSent: true },
    }))
  })

  // The old notify-approval covered the whole contract group: the composer
  // gets the lab unit and every live sibling GET /api/samples/[id] loaded.
  it('sends for the whole contract group (lab unit first), this row included', () => {
    composerProps.mockClear()
    const grouped = {
      ...sample,
      id: 's-2',
      group: [{ id: 'lab-1' }, { id: 's-2' }, { id: 's-3' }],
    } as unknown as CertSample
    render(<SampleActionsMenu sample={grouped} reload={vi.fn()} onClose={vi.fn()} />)
    expect(composerProps).toHaveBeenCalledWith(expect.objectContaining({
      selection: { sampleIds: ['lab-1', 's-2', 's-3'], parties: ['buyer', 'seller'], includeSent: true },
    }))
  })
})
