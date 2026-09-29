import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QualitySuggestion, useContractQualityMatch } from './quality-suggestion'
import { qualityDiffers } from './sub-contract-lookup'
import type { QualityMatch } from '@/lib/quality-matching'

const high: QualityMatch = { matched: true, spec_id: 'fc', spec_label: '17/18 FC', source_text: 'NY 2/3 17/18 FC', confidence: 'high', suggestions: [] }
const low: QualityMatch = {
  matched: false, spec_id: null, spec_label: null, source_text: '17/18', confidence: 'low',
  suggestions: [{ spec_id: 'fc', spec_label: '17/18 FC' }, { spec_id: 'gc', spec_label: '17/18 GC' }],
}

describe('QualitySuggestion', () => {
  it('offers a confident match that is not the one selected, and uses it on click', () => {
    const onUse = vi.fn()
    render(<QualitySuggestion match={high} currentSpecId="other" contractLabel="#41770/26" onUse={onUse} />)
    expect(screen.getByText(/Contract #41770\/26 says “NY 2\/3 17\/18 FC”/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use 17/18 FC' }))
    expect(onUse).toHaveBeenCalledWith('fc', '17/18 FC')
  })

  it('confirms a selection that matches, without a button', () => {
    render(<QualitySuggestion match={high} currentSpecId="fc" autoSelected onUse={vi.fn()} />)
    expect(screen.getByText(/Selected from it; change if needed/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers the closest specs of a weak match only while nothing is selected', () => {
    const { rerender } = render(<QualitySuggestion match={low} currentSpecId="" onUse={vi.fn()} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Use 17/18 FC', 'Use 17/18 GC'])
    rerender(<QualitySuggestion match={low} currentSpecId="gc" onUse={vi.fn()} />)
    expect(screen.queryByTestId('quality-suggestion')).not.toBeInTheDocument()
  })

  it('says so when nothing matches, and stays silent with no contract text', () => {
    const none: QualityMatch = { matched: false, spec_id: null, spec_label: null, source_text: 'Rio', confidence: 'none', suggestions: [] }
    const { rerender } = render(<QualitySuggestion match={none} currentSpecId="" onUse={vi.fn()} />)
    expect(screen.getByText(/no specification matches it clearly/)).toBeInTheDocument()
    rerender(<QualitySuggestion match={{ ...none, source_text: '' }} currentSpecId="" onUse={vi.fn()} />)
    expect(screen.queryByTestId('quality-suggestion')).not.toBeInTheDocument()
  })
})

describe('useContractQualityMatch', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function Probe({ id }: { id: string | null }) {
    const state = useContractQualityMatch(id)
    return <output>{state ? `${state.contractLabel} ${state.match?.spec_id}` : 'none'}</output>
  }

  it('reads the match of the sample’s contract, and nothing without one', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      contract: { contract_number: '41770/26', split_suffix: null }, resolution: { quality_match: high },
    })))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<Probe id="c-1" />)
    await waitFor(() => expect(screen.getByText('#41770/26 fc')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/contracts/c-1', expect.anything())
    rerender(<Probe id={null} />)
    expect(screen.getByText('none')).toBeInTheDocument()
  })
})

// A lot shares one quality: a sub-contract whose own contract names another
// is flagged, never applied.
describe('qualityDiffers', () => {
  const body = (text: string | null, spec: string | null, confidence = 'high') => ({
    contract: { quality_description: text },
    resolution: { quality_match: { confidence, spec_id: spec } },
  })
  it('flags a confident match to another spec', () => {
    expect(qualityDiffers(body('17/18 GC', 'gc'), { specId: 'fc', contractText: '17/18 FC' })).toBe('17/18 GC')
    expect(qualityDiffers(body('17/18 FC', 'fc'), { specId: 'fc', contractText: 'other' })).toBeNull()
  })
  it('compares the contract texts when there is no confident match', () => {
    expect(qualityDiffers(body('14/16 FC', null, 'low'), { specId: null, contractText: '17/18 FC' })).toBe('14/16 FC')
    expect(qualityDiffers(body('17/18  fc', null, 'none'), { specId: 'fc', contractText: '17/18 FC' })).toBeNull()
  })
  it('stays quiet with nothing to compare', () => {
    expect(qualityDiffers(body(null, null), { specId: 'fc', contractText: '17/18 FC' })).toBeNull()
    expect(qualityDiffers(body('17/18 FC', null, 'none'), { specId: null, contractText: null })).toBeNull()
  })
})

// 2026-09-29: #41770/26 says "15/16 FC" and Cape Horn has only 14/16 and
// 17/18 specifications; the intake prompts to create one for those words.
describe('QualitySuggestion: words no specification matches', () => {
  const fc1516: QualityMatch = { matched: false, spec_id: null, spec_label: null, confidence: 'none', source_text: '15/16 FC', suggestions: [] }

  it('offers to create a specification named as the contract words it', () => {
    const onCreate = vi.fn()
    render(<QualitySuggestion match={fc1516} currentSpecId={null} contractLabel="#41770/26" onUse={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByTestId('quality-suggestion')).toHaveTextContent('no specification matches it clearly')
    fireEvent.click(screen.getByRole('button', { name: 'Create “15/16 FC” specification' }))
    expect(onCreate).toHaveBeenCalledWith('15/16 FC')
  })

  it('still prompts while another specification is selected', () => {
    render(<QualitySuggestion match={fc1516} currentSpecId="spec-1416" currentSpecLabel="14/16 FINE CUP" onUse={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByTestId('quality-suggestion')).toHaveTextContent('check the selection')
    expect(screen.getByRole('button', { name: /Create “15\/16 FC”/ })).toBeInTheDocument()
  })

  it('stays quiet once the selected specification is named as the contract words it', () => {
    const { container } = render(
      <QualitySuggestion match={fc1516} currentSpecId="spec-1516" currentSpecLabel="15/16  fc" onUse={vi.fn()} onCreate={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers creating beside the closest specifications of a weak match', () => {
    const weak: QualityMatch = { ...fc1516, confidence: 'low', suggestions: [{ spec_id: 'spec-1416', spec_label: '14/16 FINE CUP' }] }
    render(<QualitySuggestion match={weak} currentSpecId={null} onUse={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Use 14/16 FINE CUP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create “15/16 FC” specification' })).toBeInTheDocument()
  })

  it('without a host that can create, a selected specification is left alone (the editor)', () => {
    const { container } = render(<QualitySuggestion match={fc1516} currentSpecId="spec-1416" currentSpecLabel="14/16 FINE CUP" onUse={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
