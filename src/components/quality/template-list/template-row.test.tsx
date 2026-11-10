import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateRow, clientsLabel, type Template } from './template-row'

const tpl = (over: Partial<Template> = {}): Template => ({
  id: 't1',
  name_en: 'Ahold SAP',
  description_en: 'Cerrado AAA',
  version: 3,
  parameters: {},
  is_active: true,
  is_global: false,
  created_by: 'u1',
  created_by_name: 'Anderson Nunes',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const handlers = {
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onManageClients: vi.fn(),
  onDeactivate: vi.fn(),
}

beforeEach(() => Object.values(handlers).forEach((h) => h.mockClear()))

describe('TemplateRow', () => {
  it('clientsLabel: one, two, many', () => {
    expect(clientsLabel([{ fantasy_name: 'Bennett' }])).toBe('Bennett')
    expect(clientsLabel([{ fantasy_name: 'Rich Coop' }, { fantasy_name: 'Blaser' }])).toBe('Rich Coop, Blaser')
    expect(clientsLabel([{ fantasy_name: 'A' }, { fantasy_name: 'B' }, { fantasy_name: 'C' }])).toBe('A, B +1')
    expect(clientsLabel([])).toBe('')
  })

  it('puts clients before the description on line two', () => {
    render(<TemplateRow template={tpl({ assigned_clients: [{ fantasy_name: 'Blaser' }], description_en: 'Cerrado AAA' })} {...handlers} spec={null} />)
    expect(screen.getByTestId('template-row-line2').textContent).toBe('Blaser · Cerrado AAA')
  })

  it('line two is the description alone with no clients', () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    expect(screen.getByTestId('template-row-line2').textContent).toBe('Cerrado AAA')
  })

  it('Edit and Duplicate are labelled icon buttons; the row opens the view', async () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit template' }))
    expect(handlers.onEdit).toHaveBeenCalled()
    expect(handlers.onView).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate template' }))
    expect(handlers.onDuplicate).toHaveBeenCalled()
    await userEvent.click(screen.getByText('Ahold SAP'))
    expect(handlers.onView).toHaveBeenCalled()
  })

  it('More holds View, Manage clients and Deactivate (last)', async () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['View', 'Manage clients', 'Deactivate'])
  })

  it('a More item does not also open the row', async () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Manage clients' }))
    expect(handlers.onManageClients).toHaveBeenCalled()
    expect(handlers.onView).not.toHaveBeenCalled()
  })

  it('right-click lists every action', () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    fireEvent.contextMenu(screen.getByText('Ahold SAP'))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Edit template',
      'Duplicate template',
      'View',
      'Manage clients',
      'Deactivate',
    ])
  })

  it('row actions are visible, not hover-only', () => {
    render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
    expect(screen.getByRole('button', { name: 'Edit template' }).closest('div')!.className).not.toContain('opacity-0')
  })
})
