import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssignCuppersDialog } from './assign-cuppers-dialog'

const cupper = { id: 'u1', full_name: 'Anderson Silva', email: 'a@wolthers.com' }

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ cuppers: [cupper] }), { status: 200 })),
  )
})

describe('AssignCuppersDialog guests', () => {
  it('adds guests by name, ignores a duplicate, and hands them to onAssign', async () => {
    const onAssign = vi.fn()
    render(<AssignCuppersDialog open onOpenChange={() => {}} sampleCount={1} onAssign={onAssign} />)
    await waitFor(() => expect(screen.getByText('Anderson Silva')).toBeInTheDocument())

    const input = screen.getByPlaceholderText('Guest name')
    fireEvent.change(input, { target: { value: 'Maria' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: ' maria ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }))

    expect(screen.getAllByText('Maria')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Assign 1 Cupper/ }))
    expect(onAssign).toHaveBeenCalledWith(['u1'], [cupper], ['Maria'])
  })

  it('pre-fills existing guests when managing cuppers, and can remove one', async () => {
    const onAssign = vi.fn()
    render(
      <AssignCuppersDialog
        open
        onOpenChange={() => {}}
        sampleCount={1}
        onAssign={onAssign}
        existingCupperIds={['u1']}
        existingGuests={[{ id: 'g1', name: 'Pedro' }]}
      />,
    )
    await waitFor(() => expect(screen.getByText('Pedro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pedro' }))
    expect(screen.queryByText('Pedro')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Update 1 Cupper/ }))
    expect(onAssign).toHaveBeenCalledWith(['u1'], [cupper], [])
  })
})
