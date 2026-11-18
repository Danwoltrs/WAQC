// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { OverrideStatusDialog } from './override-status-dialog'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function stubFetch(openBuyerRequests: Array<{ company: string }>, ok = true) {
  const fetchMock = vi.fn(async () =>
    ok ? new Response(JSON.stringify({ openBuyerRequests })) : new Response('{}', { status: 500 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderDialog = (currentlyRejected: boolean) =>
  render(
    <OverrideStatusDialog
      open
      onOpenChange={() => {}}
      certificateId="cert-1"
      certificateNumber="SAX-011863/26"
      currentlyRejected={currentlyRejected}
      onSuccess={() => {}}
    />,
  )

describe('OverrideStatusDialog open buyer requests', () => {
  it('warns, one line per company, when rejecting a lot with an open sample request', async () => {
    const fetchMock = stubFetch([{ company: 'Blaser' }, { company: 'Nespresso' }])
    renderDialog(false) // approved today, so the new status is rejected
    expect(await screen.findByText('A sample request to Blaser is open on sys. Tell the seller not to ship.')).toBeTruthy()
    expect(screen.getByText('A sample request to Nespresso is open on sys. Tell the seller not to ship.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/certificates/cert-1/override')
  })

  it('shows nothing when no request is open, and the override stays available', async () => {
    const fetchMock = stubFetch([])
    renderDialog(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText(/is open on sys/)).toBeNull()
    expect((screen.getByRole('button', { name: /Confirm Override/ }) as HTMLButtonElement).disabled).toBe(true) // comment still empty, not the warning
  })

  it('does not look while the new status is approved', async () => {
    const fetchMock = stubFetch([{ company: 'Blaser' }])
    renderDialog(true) // rejected today, so the new status is approved
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/is open on sys/)).toBeNull()
  })

  it('looks when staff switch to rejected', async () => {
    const fetchMock = stubFetch([{ company: 'Blaser' }])
    renderDialog(true)
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }))
    expect(await screen.findByText(/A sample request to Blaser is open on sys/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed lookup shows nothing', async () => {
    const fetchMock = stubFetch([], false)
    renderDialog(false)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText(/is open on sys/)).toBeNull()
  })
})
