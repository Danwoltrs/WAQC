// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { addDays, format } from 'date-fns'
import { ChangeDialog, CancelScheduledDialog } from './change-dialog'

afterEach(cleanup)

const res = (status: number, b: unknown = {}) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(b) } as Response)
const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')

const baseline = { max_quakers: 5, cupping_attributes: [{ id: 'a1', attribute: 'Body' }, { id: 'a2', attribute: 'Acidity' }] }
const quakers3 = { ...baseline, max_quakers: 3 }

function dialog(over: Partial<Parameters<typeof ChangeDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    qualityId: 'q1',
    baseVersionId: 'v3',
    baseline,
    working: quakers3,
    fetch: vi.fn(() => res(201, { versionId: 'v4', versionNo: 4, effectiveFrom: '2026-11-11', notified: 2 })),
    onSaved: vi.fn(),
    ...over,
  }
  render(<ChangeDialog {...props} />)
  return props as typeof props & { fetch: Mock; onSaved: Mock }
}
const save = () => screen.getByRole('button', { name: 'Save change' })

describe('ChangeDialog', () => {
  it('lists each change as section: path before → after, with Now chosen', () => {
    dialog()
    expect(screen.getByText('Moisture, density & quakers: max_quakers 5 → 3')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Now' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'From a date' })).not.toBeChecked()
    expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument()
    expect(save()).toBeEnabled()
  })

  it('says under Starts which version a lot is judged by', () => {
    dialog()
    expect(screen.getByText('Lots are judged by the version in force on their contract date. Lots already in grading keep theirs.')).toBeInTheDocument()
  })

  it('disables Save when nothing changed', () => {
    dialog({ working: baseline })
    expect(screen.getByText('No changes yet.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
  })

  it('needs a date from tomorrow on when saving from a date', () => {
    dialog()
    fireEvent.click(screen.getByRole('radio', { name: 'From a date' }))
    const date = screen.getByLabelText('Starts on') as HTMLInputElement
    expect(date.type).toBe('date')
    expect(date.min).toBe(tomorrow)
    expect(save()).toBeDisabled()
    fireEvent.change(date, { target: { value: tomorrow } })
    expect(save()).toBeEnabled()
  })

  it('warns once per removed cupping name and needs I understand before saving', () => {
    dialog({ working: { ...baseline, cupping_attributes: [{ id: 'a1', attribute: 'Mouthfeel' }] } })
    expect(screen.getByText('Body is no longer in the cupping attributes. Its score history does not carry over to a new name.')).toBeInTheDocument()
    expect(screen.getByText('Acidity is no longer in the cupping attributes. Its score history does not carry over to a new name.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }))
    expect(save()).toBeEnabled()
  })

  it('asks again when a different name is removed after the tick', () => {
    const p = dialog({ working: { ...baseline, cupping_attributes: [{ id: 'a1', attribute: 'Body' }] } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }))
    expect(save()).toBeEnabled()
    cleanup()
    const { rerender } = render(<ChangeDialog {...p} working={{ ...baseline, cupping_attributes: [{ id: 'a1', attribute: 'Body' }] }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }))
    expect(save()).toBeEnabled()
    rerender(<ChangeDialog {...p} working={{ ...baseline, cupping_attributes: [] }} />)
    expect(screen.getByRole('checkbox', { name: 'I understand' })).not.toBeChecked()
    expect(save()).toBeDisabled()
  })

  it('shows no rename warning when no name is removed', () => {
    dialog()
    expect(screen.queryByText(/is no longer in the cupping attributes/)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'I understand' })).toBeNull()
  })

  it('posts the working copy to start now, then calls onSaved on 201', async () => {
    const p = dialog()
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  Fewer quakers  ' } })
    fireEvent.click(save())
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledTimes(1))
    expect(p.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (p.fetch.mock.calls[0] as unknown as [string, RequestInit])
    expect(url).toBe('/api/portal/qualities/q1/versions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ baseVersionId: 'v3', parameters: quakers3, effectiveFrom: 'now', note: 'Fewer quakers' })
  })

  it('strips the attr_N ids the editor added before posting, keeping real ids', async () => {
    const stored = { moisture_max: 12.5, cupping_attributes: [{ attribute: 'Body' }, { id: 'u-1', attribute: 'Acidity' }] }
    const withIds = { ...stored, cupping_attributes: [{ attribute: 'Body', id: 'attr_0' }, { id: 'u-1', attribute: 'Acidity' }] }
    const p = dialog({ baseline: withIds, working: { ...withIds, moisture_max: 12 } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(save())
    await waitFor(() => expect(p.onSaved).toHaveBeenCalled())
    const init = (p.fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(init.body as string).parameters).toEqual({ ...stored, moisture_max: 12 })
  })

  it('posts the chosen date and a null note when the note is blank', async () => {
    const p = dialog()
    fireEvent.click(screen.getByRole('radio', { name: 'From a date' }))
    fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: tomorrow } })
    fireEvent.click(save())
    await waitFor(() => expect(p.onSaved).toHaveBeenCalled())
    const init = (p.fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(init.body as string)).toMatchObject({ effectiveFrom: tomorrow, note: null })
  })

  it('shows the server text on 409 and 400 without calling onSaved', async () => {
    const p = dialog({ fetch: vi.fn(() => res(409, { error: 'This quality changed since you opened it.' })) })
    fireEvent.click(save())
    expect(await screen.findByText('This quality changed since you opened it.')).toBeInTheDocument()
    expect(p.onSaved).not.toHaveBeenCalled()
    cleanup()
    dialog({ fetch: vi.fn(() => res(400, { error: 'Choose today or a later date.' })) })
    fireEvent.click(save())
    expect(await screen.findByText('Choose today or a later date.')).toBeInTheDocument()
  })

  it('shows a generic error on other failures', async () => {
    const p = dialog({ fetch: vi.fn(() => res(500, { error: 'boom' })) })
    fireEvent.click(save())
    expect(await screen.findByText('Could not save the change. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('boom')).toBeNull()
    expect(p.onSaved).not.toHaveBeenCalled()
    cleanup()
    dialog({ fetch: vi.fn(() => Promise.reject(new Error('offline'))) })
    fireEvent.click(save())
    expect(await screen.findByText('Could not save the change. Please try again.')).toBeInTheDocument()
  })
})

describe('CancelScheduledDialog', () => {
  const confirm = (over: Partial<Parameters<typeof CancelScheduledDialog>[0]> = {}) => {
    const props = {
      version: { id: 'v4', effectiveFrom: '2026-11-18' },
      onClose: vi.fn(),
      qualityId: 'q1',
      fetch: vi.fn(() => res(200, { ok: true })),
      onCancelled: vi.fn(),
      ...over,
    }
    render(<CancelScheduledDialog {...props} />)
    return props as typeof props & { fetch: Mock; onCancelled: Mock; onClose: Mock }
  }

  it('asks before cancelling and sends DELETE on confirm', async () => {
    const p = confirm()
    expect(screen.getByText('Cancel the change scheduled for 18 Nov 2026?')).toBeInTheDocument()
    expect(p.fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the change' }))
    await waitFor(() => expect(p.onCancelled).toHaveBeenCalledTimes(1))
    const [url, init] = (p.fetch.mock.calls[0] as unknown as [string, RequestInit])
    expect(url).toBe('/api/portal/qualities/q1/versions/v4')
    expect(init.method).toBe('DELETE')
  })

  it('keeps the change when the user backs out', () => {
    const p = confirm()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(p.onClose).toHaveBeenCalled()
    expect(p.fetch).not.toHaveBeenCalled()
  })

  it('shows the server text on 409', async () => {
    const p = confirm({ fetch: vi.fn(() => res(409, { error: 'This change has already started.' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the change' }))
    expect(await screen.findByText('This change has already started.')).toBeInTheDocument()
    expect(p.onCancelled).not.toHaveBeenCalled()
  })

  it('renders nothing without a version', () => {
    confirm({ version: null })
    expect(screen.queryByText(/Cancel the change scheduled/)).toBeNull()
  })
})
