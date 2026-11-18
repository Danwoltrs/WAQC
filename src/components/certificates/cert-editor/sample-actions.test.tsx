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
  it('opens the shared seller-email composer for this one certificate', () => {
    render(<SampleActionsMenu sample={sample} reload={vi.fn()} onClose={vi.fn()} />)
    expect(composerProps).toHaveBeenCalledWith(expect.objectContaining({
      open: true,
      selection: { sampleIds: ['s-1'], parties: ['buyer', 'seller'], includeSent: true },
    }))
  })
})
