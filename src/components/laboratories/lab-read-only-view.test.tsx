import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabReadOnlyView, sampleLabel, sampleStatusLabel } from './lab-read-only-view'

const LAB = 'lab-buenaventura'

const sample = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  created_at: '2026-11-18T10:00:00Z',
  sample_type: 'pss',
  status: 'approved',
  origin: 'Colombia',
  quality_name: 'Excelso EP',
  qc_client_name: 'Dunkin',
  exporter_name: 'Carcafe',
  certificate_number: '000123-CO/26',
  tracking_number: 'SAN-09001/26',
  container_nr: null,
  ico_number: null,
  exporter_sample_number: 'CC-771',
  wolthers_contract_nr: '42250/26',
  buyer_contract_nr: null,
  ...over,
})

const certificate = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  certificate_number: '000123-CO/26',
  created_at: '2026-11-18T12:00:00Z',
  status: 'issued',
  is_rejected: false,
  sample_id: 's1',
  sample: {
    sample_type: 'pss', origin: 'Colombia', quality_name: 'Excelso EP', wolthers_contract_nr: '42250/26',
    buyer_contract_nr: null, client: { id: 'dd', name: 'Dunkin Brands Inc.', fantasy_name: "Dunkin'" },
  },
  ...over,
})

function serve(labView: { laboratory_id: string | null; read_only: boolean }, rows = { samples: [sample()], certificates: [certificate()] }) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    const json = url.startsWith('/api/laboratories/')
      ? { laboratory: { id: LAB, name: 'Buenaventura' } }
      : url.startsWith('/api/samples')
        ? { samples: rows.samples, pagination: { total: rows.samples.length }, lab_view: labView }
        : { certificates: rows.certificates, total: rows.certificates.length, lab_view: labView }
    return { ok: true, json: async () => json } as Response
  }))
  return calls
}

describe('LabReadOnlyView', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('says whose laboratory it is and that nothing can be changed', async () => {
    const calls = serve({ laboratory_id: LAB, read_only: true })
    render(<LabReadOnlyView labId={LAB} />)
    expect(await screen.findByText('Viewing Buenaventura: read only.')).toBeInTheDocument()
    expect(await screen.findByText('Excelso EP')).toBeInTheDocument()
    expect(calls).toContain(`/api/samples?laboratory_id=${LAB}&limit=50&offset=0`)
  })

  it('never shows the internal lab number, and offers no way to change a row', async () => {
    serve({ laboratory_id: LAB, read_only: true })
    const { container } = render(<LabReadOnlyView labId={LAB} />)
    await screen.findByText('000123-CO/26')
    expect(container.textContent).not.toContain('SAN-')
    // Only navigation: the way back, and (when there is more) Show more.
    expect(screen.queryByRole('button', { name: /edit|delete|save|send|override/i })).toBeNull()
  })

  it('lists the certificates with the fantasy name and a link to each PDF', async () => {
    serve({ laboratory_id: LAB, read_only: true })
    const user = userEvent.setup()
    render(<LabReadOnlyView labId={LAB} />)
    await user.click(await screen.findByRole('radio', { name: 'Certificates' }))
    expect(await screen.findByText("Dunkin'")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open certificate 000123-CO/26' })).toHaveAttribute('href', '/api/samples/s1/certificate')
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('shows nothing when the server answers with another laboratory: the caller may not read this one', async () => {
    serve({ laboratory_id: 'lab-own', read_only: false })
    render(<LabReadOnlyView labId={LAB} />)
    expect(await screen.findByText('You cannot view this laboratory.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Excelso EP')).toBeNull())
  })
})

describe('labels', () => {
  it('names a sample by its certificate, else its own number, else its contract', () => {
    expect(sampleLabel(sample() as never)).toBe('000123-CO/26')
    expect(sampleLabel(sample({ certificate_number: null }) as never)).toBe('CC-771')
    expect(sampleLabel(sample({ certificate_number: null, exporter_sample_number: null }) as never)).toBe('42250/26')
    // A legacy certificate numbered with the lab number is not a reference.
    expect(sampleLabel(sample({ certificate_number: 'SAN-09001/26' }) as never)).toBe('CC-771')
  })

  it('reads a type sample by its range', () => {
    expect(sampleStatusLabel({ status: 'rejected', sample_type: 'type' })).toBe('Out of range')
    expect(sampleStatusLabel({ status: 'rejected', sample_type: 'pss' })).toBe('Rejected')
    expect(sampleStatusLabel({ status: 'in_progress', sample_type: 'pss' })).toBe('In progress')
  })
})
