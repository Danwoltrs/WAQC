import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeasurementSelect, resetMeasurementOptionsCache } from './measurement-select'

const listed = [
  { id: 'a', kind: 'humidity_method', name: 'Coffee industry', is_iso: false, spec_key: 'coffee_industry', is_active: true, sort_order: 10 },
  { id: 'b', kind: 'humidity_method', name: 'ISO 6673', is_iso: true, spec_key: 'iso_6673', is_active: true, sort_order: 20 },
]

function serve(editable = true) {
  const posts: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push(body)
      return { ok: true, json: async () => ({ option: { id: 'new', spec_key: null, is_active: true, sort_order: 100, ...body } }) } as Response
    }
    return { ok: true, json: async () => ({ options: listed, editable }) } as Response
  }))
  return posts
}

describe('MeasurementSelect', () => {
  beforeEach(() => resetMeasurementOptionsCache())
  afterEach(() => vi.unstubAllGlobals())

  it('offers the lab list and reports the ISO flag of what is picked', async () => {
    serve()
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MeasurementSelect kind="humidity_method" value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Humidity method' }))
    await user.click(await screen.findByRole('option', { name: 'ISO 6673' }))
    expect(onChange).toHaveBeenCalledWith('ISO 6673', true)
  })

  it('lets the lab add a method, marked ISO or not, and picks it', async () => {
    const posts = serve()
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MeasurementSelect kind="humidity_method" value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Humidity method' }))
    await user.click(await screen.findByRole('option', { name: 'Add a method…' }))
    await user.type(await screen.findByRole('textbox', { name: 'Add a method' }), 'Sinar 6070')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Sinar 6070', false))
    expect(posts).toEqual([{ kind: 'humidity_method', name: 'Sinar 6070', is_iso: false }])
  })

  it('has no "add" entry when the list cannot be edited', async () => {
    serve(false)
    const user = userEvent.setup()
    render(<MeasurementSelect kind="density_type" value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox', { name: 'Density type' }))
    expect(await screen.findByRole('option', { name: 'Not set' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Add a type…' })).toBeNull()
  })
})
