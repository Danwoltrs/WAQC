// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { PortalVersionView } from '@/lib/portal/portal-qualities'
import { VersionsPanel } from './versions-panel'

afterEach(cleanup)

const v = (over: Partial<PortalVersionView>): PortalVersionView => ({
  id: 'x', versionNo: 1, effectiveFrom: '2026-01-01', status: 'past', changedBy: 'Wolthers', note: null, cancelNote: null, ...over,
})
const versions: PortalVersionView[] = [
  v({ id: 'v2', versionNo: 2, effectiveFrom: '2026-03-01', status: 'in_force', changedBy: 'Ana Souza', note: 'Moisture to 12.5' }),
  v({ id: 'v1', versionNo: 1, effectiveFrom: '2025-09-01', status: 'past' }),
  v({ id: 'v4', versionNo: 4, effectiveFrom: '2027-09-01', status: 'scheduled', changedBy: 'Ana Souza' }),
  v({ id: 'v3', versionNo: 3, effectiveFrom: '2027-01-01', status: 'cancelled', cancelNote: 'Contract changed' }),
]

describe('VersionsPanel', () => {
  it('lists versions newest first with their status labels', () => {
    render(<VersionsPanel versions={versions} canEdit={false} />)
    const rows = screen.getAllByTestId('version-row')
    expect(rows.map((r) => within(r).getByTestId('version-no').textContent)).toEqual(['v4', 'v3', 'v2', 'v1'])
    expect(within(rows[0]).getByText('Scheduled from 1 Sep 2027')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Cancelled')).toBeInTheDocument()
    expect(within(rows[2]).getByText('In force')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Past')).toBeInTheDocument()
  })

  it('shows who changed it, the note, and a cancelled row its cancel note', () => {
    render(<VersionsPanel versions={versions} canEdit={false} />)
    const rows = screen.getAllByTestId('version-row')
    expect(within(rows[2]).getByText('Changed by Ana Souza')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Moisture to 12.5')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Changed by Wolthers')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Contract changed')).toBeInTheDocument()
  })

  it('offers Cancel on the scheduled row only, and only when the client can edit', () => {
    const onCancel = vi.fn()
    render(<VersionsPanel versions={versions} canEdit onCancel={onCancel} />)
    const buttons = screen.getAllByRole('button', { name: 'Cancel' })
    expect(buttons).toHaveLength(1)
    expect(screen.getAllByTestId('version-row')[0]).toContainElement(buttons[0])
    fireEvent.click(buttons[0])
    expect(onCancel).toHaveBeenCalledWith('v4')
  })

  it('hides Cancel when the client cannot edit', () => {
    render(<VersionsPanel versions={versions} canEdit={false} onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('says so when there are no versions', () => {
    render(<VersionsPanel versions={[]} canEdit={false} />)
    expect(screen.getByText('No versions yet.')).toBeInTheDocument()
  })
})
