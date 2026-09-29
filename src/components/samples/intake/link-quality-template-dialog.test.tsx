import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'

// 14/16 FINE CUP as Cape Horn has it: the requirement sits on screen 16.
const FINE_CUP = {
  id: 'cq-fc',
  custom_name: '14/16 FINE CUP',
  quality_code: 'FC',
  template: {
    id: 'tpl-fc',
    name_en: '14/16 FINE CUP',
    description_en: 'Brazil 14/16 Fine Cup',
    methodology: 'commodity',
    parameters: {
      origin: 'Brazil',
      screen_size_requirements: {
        constraints: [
          { screen_size: 'Screen 16', constraint_type: 'minimum', min_value: 45 },
          { screen_size: 'Screen 15', constraint_type: 'any' },
          { screen_size: 'Screen 14', constraint_type: 'any' },
          { screen_size: 'Pan', constraint_type: 'maximum', max_value: 10 },
        ],
      },
      defect_configuration: { defects: [], thresholds: { max_total: 21 } },
      moisture_max: 12.5,
    },
  },
}
const SEVENTEEN = { id: 'cq-17', custom_name: '17/18 FC', template: { id: 'tpl-17', name_en: '17/18 FC', parameters: {} } }

type Routes = { specs?: unknown[]; duplicate?: Response }

/** fetch stand-in: the client's specs, the shared templates, and the duplicate call. */
function stubFetch({ specs = [], duplicate }: Routes = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/clients/') && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ specifications: specs }), { status: 200 })
    }
    if (url.startsWith('/api/quality-templates')) return new Response(JSON.stringify({ templates: [] }), { status: 200 })
    if (url.includes('/duplicate')) {
      return duplicate ?? new Response(JSON.stringify({ client_quality: { id: 'cq-new', custom_name: '15/16 FC' } }), { status: 201 })
    }
    if (url.startsWith('/api/micro-regions')) return new Response(JSON.stringify({ regions: [] }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const open = (props: Partial<React.ComponentProps<typeof LinkQualityTemplateDialog>> = {}) =>
  render(
    <LinkQualityTemplateDialog open onOpenChange={vi.fn()} clientId="co-cape" clientName="Cape Horn"
      onSuccess={vi.fn()} initialName="15/16 FC" initialOrigin="Brazil" {...props} />,
  )

// 2026-09-29: the intake's "Create “15/16 FC” specification" opens this
// dialog already named as the contract words it.
describe('LinkQualityTemplateDialog started from a contract', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('opens as a new specification, linking a shared template when the client has none', async () => {
    stubFetch()
    open()
    expect(screen.getByRole('heading', { name: 'New quality specification' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('15/16 FC')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Duplicate/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link template' })).toBeInTheDocument()
  })

  it('keeps its plain title when opened without contract words', () => {
    stubFetch()
    open({ initialName: undefined, initialOrigin: undefined })
    expect(screen.getByRole('heading', { name: 'Link Quality Template' })).toBeInTheDocument()
  })
})

// Daniel 2026-09-29: "duplicate a previous quality, and change some small
// specifications only, all on this screen".
describe('LinkQualityTemplateDialog duplicating a client specification', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('starts from the suggested specification, edits the copy in place, and saves it in one request', async () => {
    const fetchMock = stubFetch({ specs: [SEVENTEEN, FINE_CUP] })
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    open({ suggestedSpecId: 'cq-fc', onSuccess, onOpenChange })

    // The client's specifications are offered, the suggestion picked.
    expect(await screen.findByRole('radio', { name: /14\/16 FINE CUP/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /17\/18 FC/ })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate and edit' }))

    // The copy is named as the contract words it, and nothing exists yet.
    expect(await screen.findByText(/from 14\/16 FINE CUP/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/duplicate'))).toBe(false)

    // Change one value.
    fireEvent.click(screen.getByRole('button', { name: /Moisture %/ }))
    fireEvent.change(screen.getByLabelText('Max (%)'), { target: { value: '12' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 'cq-new', custom_name: '15/16 FC' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/duplicate'))!
    expect(call[0]).toBe('/api/client-qualities/cq-fc/duplicate')
    const body = JSON.parse(String((call[1] as RequestInit).body))
    expect(body.custom_name).toBe('15/16 FC')
    expect(body.template.parameters.moisture_max).toBe(12)
    expect(body.template.description_en).toBe('15/16 FC')
    expect(body.template.parameters.screen_size_requirements.constraints.map((c: any) => c.screen_size))
      .toEqual(['Screen 15', 'Pan', 'Screen 16'])
  })

  // Daniel 2026-09-29: changes read from the contract show in amber until the
  // lab checks them, then green.
  it('opens on the changes read from the contract, in amber, and turns each green when marked correct', async () => {
    stubFetch({ specs: [FINE_CUP] })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate and edit' }))

    // Basic information first: the description is the contract's text.
    expect(await screen.findByRole('heading', { name: 'Basic information' })).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('15/16 FC')
    expect(screen.getByLabelText('Description').className).toMatch(/amber/)
    expect(screen.getByText('2 changes from the contract to check')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
    expect(screen.getByLabelText('Description').className).toMatch(/green/)
    expect(screen.getByText('1 change from the contract to check')).toBeInTheDocument()

    // Screens: 16 is 15/16's highest screen and keeps the requirement; 14,
    // below the contract's range, goes.
    fireEvent.click(screen.getByRole('button', { name: /Screen sizes/ }))
    expect(screen.getByText('Screen 14 any')).toBeInTheDocument()
    expect(screen.getByText('Screen 14 removed')).toBeInTheDocument()
    expect(screen.queryByText('Screen 14')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
    expect(screen.queryByText(/from the contract to check/)).not.toBeInTheDocument()
  })

  it('copies the full quality description of the contract’s sys quality, showing what it was', async () => {
    const full = 'Brazil Arabica Unwashed Coffee - NY 2/3 , Screen 15/16, Strictly Soft, Fine Cup, Crop 2026/2027.'
    stubFetch({ specs: [FINE_CUP] })
    open({ contractDescription: full })
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate and edit' }))
    expect(await screen.findByLabelText('Description')).toHaveValue(full)
    expect(screen.getByText('Brazil 14/16 Fine Cup')).toBeInTheDocument()
    expect(screen.getByText(full, { selector: 'dd' })).toBeInTheDocument()
  })

  it('undoes a change back to the source', async () => {
    stubFetch({ specs: [FINE_CUP] })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate and edit' }))
    fireEvent.click(await screen.findByRole('button', { name: /Screen sizes/ }))
    expect(screen.queryByText('Screen 14')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Screen 14')).toBeInTheDocument()
    expect(screen.queryByText('Screen 14 removed')).not.toBeInTheDocument()
  })

  it('shows a refused name inline and keeps the edits', async () => {
    stubFetch({
      specs: [FINE_CUP],
      duplicate: new Response(JSON.stringify({ error: 'This client already has a specification named "15/16 FC"' }), { status: 409 }),
    })
    const onSuccess = vi.fn()
    open({ onSuccess })
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate and edit' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/already has a specification named "15\/16 FC"/)).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
    // The name is on Basic information, where the editor now stands.
    expect(screen.getByRole('heading', { name: 'Basic information' })).toBeInTheDocument()
  })

  it('goes back to the starting point without creating anything', async () => {
    const fetchMock = stubFetch({ specs: [FINE_CUP] })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate and edit' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('radio', { name: /14\/16 FINE CUP/ })).toBeChecked()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/duplicate'))).toBe(false)
  })
})
