import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendUnsentMenu } from './send-unsent-menu'

// jsdom (25) has no PointerEvent, so fireEvent.pointerDown builds a bare Event
// with no `button` — and a Radix trigger only opens on a button-0 pointerdown.
// A MouseEvent that carries a pointerType is all the menu needs to see a tap.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? ''
  }
}
const scopes = [globalThis, document.defaultView] as unknown as Array<Record<string, unknown>>
const originals = scopes.map((scope) => scope.PointerEvent)
beforeAll(() => scopes.forEach((scope) => { scope.PointerEvent = TestPointerEvent }))
afterAll(() => scopes.forEach((scope, i) => { scope.PointerEvent = originals[i] }))

const trigger = () => screen.getByRole('button', { name: /send unsent/i })

describe('SendUnsentMenu', () => {
  it('opens on hover and hands back the chosen period', async () => {
    const onSelect = vi.fn()
    render(<SendUnsentMenu onSelect={onSelect} />)
    fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /2w/i }))
    expect(onSelect).toHaveBeenCalledWith('2w')
  })

  it('offers today, one, two and four weeks — nothing longer', async () => {
    render(<SendUnsentMenu onSelect={() => {}} />)
    fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' })
    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(4)
    ;[/1d/, /1w/, /2w/, /4w/].forEach((label, i) => expect(items[i]).toHaveTextContent(label))
  })

  // There is no hover on the iPad: a tap has to open it as well.
  it('opens on a tap', async () => {
    render(<SendUnsentMenu onSelect={() => {}} />)
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false, pointerType: 'touch' })
    expect(await screen.findAllByRole('menuitem')).toHaveLength(4)
  })
})
