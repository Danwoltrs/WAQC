import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const footers = [
  ['DialogFooter', DialogFooter, 'rounded-b-lg'],
  ['AlertDialogFooter', AlertDialogFooter, 'sm:rounded-b-lg'],
] as const

describe.each(footers)('%s', (_name, Footer, corner) => {
  it('puts start on the left and children on the right', () => {
    render(
      <Footer start={<button>Delete</button>}>
        <button>Cancel</button>
        <button>Save</button>
      </Footer>
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Delete', 'Cancel', 'Save'])
  })

  it('is sticky at the bottom, edge to edge, on the muted bar', () => {
    const { container } = render(<Footer><button>Save</button></Footer>)
    const c = (container.firstChild as HTMLElement).className
    for (const cls of ['sticky', '-bottom-4', 'sm:-bottom-6', 'border-t', 'bg-muted', '-mx-4', 'sm:-mx-6', '-mb-4', 'sm:-mb-6']) {
      expect(c).toContain(cls)
    }
  })

  it("carries its container's bottom corners", () => {
    const { container } = render(<Footer><button>Save</button></Footer>)
    expect((container.firstChild as HTMLElement).className).toContain(corner)
  })

  it('lets a caller cancel the bleed at every width', () => {
    const { container } = render(
      <Footer className="mx-0 mb-0 sm:mx-0 sm:mb-0 bottom-0 sm:bottom-0"><button>Save</button></Footer>
    )
    const c = (container.firstChild as HTMLElement).className
    expect(c).toContain('mx-0')
    expect(c).not.toContain('-mx-4')
    expect(c).not.toContain('sm:-mx-6')
    expect(c).not.toContain('-bottom-4')
    expect(c).not.toContain('sm:-bottom-6')
    expect(c).not.toContain('-mb-4')
    expect(c).not.toContain('sm:-mb-6')
  })

  it('keeps primary on top on mobile', () => {
    const { container } = render(<Footer><button>Save</button></Footer>)
    expect((container.firstChild as HTMLElement).innerHTML).toContain('flex-col-reverse')
  })
})

describe('AlertDialogAction', () => {
  it('takes a variant', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Sure?</AlertDialogTitle>
          <AlertDialogDescription>Really</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-destructive')
  })
})
