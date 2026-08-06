# Unified Print Preview Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every print surface in the app through one fullscreen preview module with X + Esc + `Save PDF` + `Print`, and add tin-label and bag-sleeve printing to the `/certificates` bulk menu.

**Architecture:** One shared `PrintPreviewDialog` owns the fullscreen shell, the PDF iframe, the `print()` call and the save-anchor. Each caller keeps its own small config dialog and passes a blob URL plus an `onPrinted` callback for its side effects. Two pure functions map a certificate selection onto the two sleeve routes, which already accept everything needed — no API changes anywhere.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui (Radix Dialog), lucide-react, sonner, vitest + @testing-library/react (jsdom).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-06-unified-print-preview-module-design.md`.
- **No API route changes.** `print-tin-sleeves`, `print-bag-sleeves` and `print-labels` are used exactly as they are today.
- **`onPrinted` fires only from `Print`, never from `Save PDF`.** This is the safety property the whole design rests on: tin labels stamp `mark-printed` and cupping cards commit a stage advance inside `onPrinted`, so saving a copy must never consume a batch or advance a workflow stage.
- **No emojis in the UI** (project rule, `CLAUDE.md`).
- **No mock data.**
- Trunk-based: commit directly to `main` after each task. No feature branches.
- Files stay under ~2000 lines.
- Run `npx vitest run <path>` for tests; `npx tsc --noEmit` for typechecking.
- Fullscreen content class, used verbatim by the shell:
  `'!flex flex-col gap-0 p-0 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden'`

## File Structure

**Create:**
- `src/lib/print-selection.ts` — pure certificate-selection → print-request mapping.
- `src/lib/print-selection.test.ts` — its tests.
- `src/components/print/print-preview-dialog.tsx` — the shared fullscreen shell.
- `src/components/print/print-preview-dialog.test.tsx` — the `onPrinted` contract.
- `src/components/samples/print-bag-sleeves-dialog.tsx` — bag sleeve config step + preview.

**Modify:**
- `src/components/samples/tin-label-size-dialog.tsx` — preview step → shell, adds `countNote`.
- `src/components/samples/print-labels-dialog.tsx` — adds a preview step, drops `window.open`.
- `src/components/cupping/print-cupping-cards-dialog.tsx` — preview step → shell.
- `src/app/samples/qc/page.tsx` — bag sleeve download plumbing → dialog.
- `src/app/certificates/page.tsx` — two bulk menu items, eye-icon preview → shell.
- `src/components/certificates/cert-editor/use-sample-actions.ts` — label print returns a blob URL.
- `src/components/certificates/cert-editor/sample-actions.tsx` — two dialogs → shell.

---

### Task 1: Certificate selection → print request mapping

Pure functions, no React. They exist separately because the tin dedupe rule is invisible in the UI and would regress silently.

**Files:**
- Create: `src/lib/print-selection.ts`
- Test: `src/lib/print-selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PrintSelectionCertificate` — `{ sample_id: string | null; sample_contract_id: string | null }`
  - `BagSleeveEntry` — `{ id: string; contractId?: string; includeQrCode: boolean }`
  - `certificatesToTinSampleIds(certs: PrintSelectionCertificate[]): string[]`
  - `certificatesToBagSleeveEntries(certs: PrintSelectionCertificate[], includeQrCode: boolean): BagSleeveEntry[]`

**Background the implementer needs.** A "mother" sample can be split into sub-contracts, each of which gets its own certificate row carrying `sample_contract_id`. The mother's own certificate has `sample_contract_id: null`. The two sleeve routes treat this oppositely:

- `src/app/api/samples/bulk/print-tin-sleeves/route.tsx:140` emits **one label per mother sample**, comma-joining every certificate belonging to it into the `Cert.` field. One tin covers the whole lot. So a selection of a mother plus its ten splits must collapse to **one** id.
- `src/app/api/samples/bulk/print-bag-sleeves/route.tsx:122` emits **one sleeve per entry** and takes an optional `contractId` that overrides tracking number, contract refs, ICO and container from `sample_contracts`. So each selected certificate gets its own entry.

- [ ] **Step 1: Write the failing test**

Create `src/lib/print-selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  certificatesToTinSampleIds,
  certificatesToBagSleeveEntries,
  type PrintSelectionCertificate,
} from './print-selection'

const cert = (
  sample_id: string | null,
  sample_contract_id: string | null = null,
): PrintSelectionCertificate => ({ sample_id, sample_contract_id })

describe('certificatesToTinSampleIds', () => {
  it('returns one id for a mother certificate', () => {
    expect(certificatesToTinSampleIds([cert('s1')])).toEqual(['s1'])
  })

  it('collapses a mother and its splits to one id (one tin covers the lot)', () => {
    const selection = [cert('s1'), cert('s1', 'c1'), cert('s1', 'c2'), cert('s1', 'c3')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s1'])
  })

  it('collapses splits to their lot even when the mother is not selected', () => {
    expect(certificatesToTinSampleIds([cert('s1', 'c1'), cert('s1', 'c2')])).toEqual(['s1'])
  })

  it('keeps one id per lot, in first-seen order, across lots', () => {
    const selection = [cert('s2', 'c9'), cert('s1'), cert('s2'), cert('s1', 'c1')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s2', 's1'])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToTinSampleIds([cert(null), cert('s1'), cert(null, 'c1')])).toEqual(['s1'])
  })

  it('returns an empty array for an empty selection', () => {
    expect(certificatesToTinSampleIds([])).toEqual([])
  })
})

describe('certificatesToBagSleeveEntries', () => {
  it('maps a mother certificate to an entry with no contractId', () => {
    expect(certificatesToBagSleeveEntries([cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('maps a split certificate to an entry carrying its contractId', () => {
    expect(certificatesToBagSleeveEntries([cert('s1', 'c1')], true)).toEqual([
      { id: 's1', contractId: 'c1', includeQrCode: true },
    ])
  })

  it('does NOT collapse a mother and its splits — each gets its own sleeve', () => {
    const selection = [cert('s1'), cert('s1', 'c1'), cert('s1', 'c2')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's1', includeQrCode: true },
      { id: 's1', contractId: 'c1', includeQrCode: true },
      { id: 's1', contractId: 'c2', includeQrCode: true },
    ])
  })

  it('applies includeQrCode across the whole batch', () => {
    const selection = [cert('s1'), cert('s1', 'c1')]
    expect(certificatesToBagSleeveEntries(selection, false)).toEqual([
      { id: 's1', includeQrCode: false },
      { id: 's1', contractId: 'c1', includeQrCode: false },
    ])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToBagSleeveEntries([cert(null), cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('deduplicates a lot/contract pair listed twice', () => {
    const selection = [cert('s1', 'c1'), cert('s1', 'c1')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's1', contractId: 'c1', includeQrCode: true },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/print-selection.test.ts`
Expected: FAIL — `Failed to resolve import "./print-selection"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/print-selection.ts`:

```ts
/**
 * Maps a certificate-row selection onto the two sleeve print routes.
 *
 * These live apart from the page because the two routes treat sub-contracts
 * oppositely, and the difference is invisible in the UI: get it wrong and the
 * operator just sees the wrong number of sheets.
 */

/** The only fields of a certificate row that the mapping needs. */
export interface PrintSelectionCertificate {
  sample_id: string | null
  /** Set on a sub-contract (split) certificate; null on the mother's. */
  sample_contract_id: string | null
}

/** One entry in the POST body of /api/samples/bulk/print-bag-sleeves. */
export interface BagSleeveEntry {
  id: string
  contractId?: string
  includeQrCode: boolean
}

/**
 * One tin label covers a whole lot: the route emits a single label per mother
 * sample and comma-joins every certificate belonging to it — mother first, then
 * each sub-contract by sort_order — into the Cert. field. So a mother plus its
 * ten splits is ONE label, not eleven.
 *
 * Order is first-seen, so the sheet follows the order of the list on screen.
 */
export function certificatesToTinSampleIds(
  certs: PrintSelectionCertificate[],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id || seen.has(cert.sample_id)) continue
    seen.add(cert.sample_id)
    ids.push(cert.sample_id)
  }
  return ids
}

/**
 * Bag sleeves are the opposite: one sleeve per certificate. Passing contractId
 * makes the route override tracking number, contract refs, ICO and container
 * from sample_contracts, so a split prints its own references rather than its
 * mother's.
 *
 * Deduplication is on the (lot, contract) pair only — defensive, since the same
 * certificate cannot legitimately appear twice in one selection.
 */
export function certificatesToBagSleeveEntries(
  certs: PrintSelectionCertificate[],
  includeQrCode: boolean,
): BagSleeveEntry[] {
  const entries: BagSleeveEntry[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id) continue
    const key = `${cert.sample_id}:${cert.sample_contract_id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      id: cert.sample_id,
      ...(cert.sample_contract_id ? { contractId: cert.sample_contract_id } : {}),
      includeQrCode,
    })
  }
  return entries
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/print-selection.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/print-selection.ts src/lib/print-selection.test.ts
git commit -m "feat(print): map a certificate selection onto the two sleeve routes"
```

---

### Task 2: The shared fullscreen shell

**Files:**
- Create: `src/components/print/print-preview-dialog.tsx`
- Test: `src/components/print/print-preview-dialog.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `PRINT_PREVIEW_CONTENT_CLASS: string`
  - `PrintPreviewDialogProps` and `PrintPreviewDialog` — props exactly as written in Step 3. Tasks 3–8 all render this component.

**Background the implementer needs.** `src/components/ui/dialog.tsx:47` already renders a close X at `right-4 top-4` inside every `DialogContent`, and Radix's `Dialog` already closes on Esc and traps focus. So the X + Esc requirement is met purely by using `Dialog` — do **not** hand-roll a `fixed inset-0` overlay with a keydown listener the way `certificate-edit-overlay.tsx:110` does. The header needs `pr-14` so the title never runs under that X.

The fullscreen class follows the pattern already established by `INTAKE_DIALOG_CONTENT_CLASS` at `src/components/samples/sample-intake-dialog.tsx:29`.

- [ ] **Step 1: Write the failing test**

Create `src/components/print/print-preview-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrintPreviewDialog } from './print-preview-dialog'

// jsdom has no real printing or navigation. Stub both so the component's
// fallback path is exercised without console noise or unhandled errors.
beforeEach(() => {
  vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const renderShell = (overrides: Record<string, unknown> = {}) => {
  const onPrinted = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <PrintPreviewDialog
      open
      onOpenChange={onOpenChange}
      title="Print tin labels"
      subtitle="7 lots at 4cm"
      pdfUrl="about:blank"
      saveFileName="tin-sleeves.pdf"
      onPrinted={onPrinted}
      {...overrides}
    />
  )
  return { onPrinted, onOpenChange }
}

describe('PrintPreviewDialog', () => {
  it('fires onPrinted when Print is pressed', () => {
    const { onPrinted } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: /print/i }))
    expect(onPrinted).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onPrinted when Save PDF is pressed', () => {
    // The safety property: saving a copy must never stamp a batch as printed
    // or advance a cupping stage.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { onPrinted } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: /save pdf/i }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onPrinted).not.toHaveBeenCalled()
  })

  it('uses onSave when supplied, and still does not fire onPrinted', () => {
    const onSave = vi.fn()
    const { onPrinted } = renderShell({ onSave })
    fireEvent.click(screen.getByRole('button', { name: /save pdf/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onPrinted).not.toHaveBeenCalled()
  })

  it('disables both actions while the preview is still rendering', () => {
    renderShell({ pdfUrl: null, loading: true })
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save pdf/i })).toBeDisabled()
    expect(screen.getByText(/preparing preview/i)).toBeInTheDocument()
  })

  it('shows the failure reason instead of an empty frame', () => {
    renderShell({ pdfUrl: null, error: 'boom' })
    expect(screen.getByText(/could not build the preview: boom/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
  })

  it('renders the title, subtitle and both extra slots', () => {
    renderShell({
      headerExtra: <span>doc switcher</span>,
      footerExtra: <button type="button">Send Email</button>,
    })
    expect(screen.getByText('Print tin labels')).toBeInTheDocument()
    expect(screen.getByText('7 lots at 4cm')).toBeInTheDocument()
    expect(screen.getByText('doc switcher')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Email' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/print/print-preview-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./print-preview-dialog"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/print/print-preview-dialog.tsx`:

```tsx
'use client'

import { useRef, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Printer } from 'lucide-react'

/**
 * Fullscreen, following the pattern of INTAKE_DIALOG_CONTENT_CLASS. Radix
 * supplies Esc, the focus trap and the X at right-4 top-4, so nothing here is
 * hand-rolled — which is also why the header carries pr-14.
 */
export const PRINT_PREVIEW_CONTENT_CLASS =
  '!flex flex-col gap-0 p-0 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden'

export interface PrintPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  /** Blob or API URL for the PDF. Null while it is still being produced. */
  pdfUrl: string | null
  loading?: boolean
  error?: string | null
  /** Filename for the default Save action. Ignored when onSave is supplied. */
  saveFileName: string
  /** Extra controls under the title — the cupping-card document switcher. */
  headerExtra?: ReactNode
  /** Extra footer buttons, left of Save — Send Email on certificate previews. */
  footerExtra?: ReactNode
  /** Replaces the default anchor download. */
  onSave?: () => void
  /**
   * Fired once the browser print dialog has been opened — NEVER by Save.
   * Callers hang their side effects here (stamping tin labels as printed,
   * committing a cupping stage advance), so saving a copy to check something
   * cannot consume a batch.
   */
  onPrinted?: () => void
}

export function PrintPreviewDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  pdfUrl,
  loading = false,
  error = null,
  saveFileName,
  headerExtra,
  footerExtra,
  onSave,
  onPrinted,
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const ready = !!pdfUrl && !loading && !error

  const handlePrint = () => {
    // Fire the physical print FIRST — it must never be gated on anything, so a
    // slow side effect on a laggy lab connection cannot delay or swallow it.
    try {
      const frame = iframeRef.current
      if (!frame?.contentWindow) throw new Error('preview not ready')
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch (err) {
      console.error('Unable to trigger print on the preview:', err)
      // Fall back to a tab the user can print by hand.
      if (pdfUrl) window.open(pdfUrl, '_blank')
    }
    onPrinted?.()
  }

  const handleSave = () => {
    if (onSave) {
      onSave()
      return
    }
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = saveFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={PRINT_PREVIEW_CONTENT_CLASS}>
        <DialogHeader className="flex-shrink-0 border-b px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-xs">{subtitle}</DialogDescription>
          ) : null}
          {headerExtra ? <div className="pt-2">{headerExtra}</div> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-muted/20">
          {ready && pdfUrl ? (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title={title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {error ? (
                `Could not build the preview: ${error}`
              ) : (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing preview...
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
          {footerExtra}
          <Button variant="outline" onClick={handleSave} disabled={!ready}>
            <Download className="mr-2 h-4 w-4" />
            Save PDF
          </Button>
          <Button onClick={handlePrint} disabled={!ready}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/print/print-preview-dialog.test.tsx`
Expected: PASS, 6 tests.

If the "Preparing preview..." assertion fails on the ellipsis, note the literal in the component is three dots, not a `…` character — keep it that way and match it in the test.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/components/print/print-preview-dialog.tsx src/components/print/print-preview-dialog.test.tsx
git commit -m "feat(print): shared fullscreen print preview shell"
```

---

### Task 3: Tin labels through the shell

**Files:**
- Modify: `src/components/samples/tin-label-size-dialog.tsx` (whole file)

**Interfaces:**
- Consumes: `PrintPreviewDialog` from Task 2.
- Produces: `TinLabelSizeDialogProps` gains one optional prop — `countNote?: string`. Task 5 passes it. Existing callers (`src/app/samples/qc/page.tsx:2128`, `src/components/samples/print-today-tin-labels-button.tsx:90`) are unchanged and must keep working.

**What changes.** The size step keeps its small dialog. The preview step's inline `sm:max-w-3xl` iframe and its footer are replaced by `PrintPreviewDialog`, which brings `Save PDF` with it. The `mark-printed` POST moves out of `handlePrint` and into `onPrinted`, so it still runs on Print and never on Save.

- [ ] **Step 1: Replace the file**

Overwrite `src/components/samples/tin-label-size-dialog.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'

export type TinLabelSize = '4cm' | '2.5cm'

interface TinLabelSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  /**
   * Shown in the size step when the caller's selection collapsed — a
   * certificate selection dedupes to lots, so the sheet count is lower than
   * the number of rows ticked, and that needs saying before anything prints.
   */
  countNote?: string
  onSuccess?: () => void
}

/**
 * Size, then preview, then print.
 *
 * Samples are stamped as printed only when Print is pressed, so opening a
 * preview to check something — or saving a copy — does not consume the batch.
 */
export function TinLabelSizeDialog({
  open,
  onOpenChange,
  sampleIds,
  countNote,
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [step, setStep] = useState<'size' | 'preview'>('size')
  const [selectedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [printedIds, setPrintedIds] = useState<string[]>([])

  // Reset to the size step whenever the dialog reopens, and release the blob
  // URL so a long session does not accumulate them.
  useEffect(() => {
    if (!open) {
      setStep('size')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setPrintedIds([])
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-tin-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds, size: selectedSize }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate tin labels')
      }

      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setPrintedIds(sampleIds)
      setStep('preview')
    } catch (error) {
      console.error('Error generating tin labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate tin labels')
    } finally {
      setIsGenerating(false)
    }
  }

  // Runs only after the browser print dialog has opened. The browser gives us
  // no reliable signal that paper came out, so the stamp goes on once the
  // dialog has been opened. A jammed print is recovered by selecting those rows
  // and using Tin Label again.
  const handlePrinted = async () => {
    try {
      const response = await fetch('/api/samples/tin-labels/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: printedIds }),
      })
      if (!response.ok) {
        toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
      }
    } catch {
      toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
    }

    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open && step === 'size'} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select tin label size</DialogTitle>
            <DialogDescription>
              {countNote ||
                `Choose the label size for ${sampleIds.length} lot${sampleIds.length !== 1 ? 's' : ''}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <RadioGroup
              value={selectedSize}
              onValueChange={(value) => setSelectedSize(value as TinLabelSize)}
              className="space-y-4"
            >
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="4cm" id="size-4cm" />
                <div className="flex-1">
                  <Label htmlFor="size-4cm" className="text-sm font-medium leading-none cursor-pointer">
                    4cm height (standard)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For standard-sized tin containers</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="2.5cm" id="size-2.5cm" />
                <div className="flex-1">
                  <Label htmlFor="size-2.5cm" className="text-sm font-medium leading-none cursor-pointer">
                    2.5cm height (compact)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For smaller tin containers</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) onOpenChange(false) }}
        title="Print tin labels"
        subtitle={`${printedIds.length} lot${printedIds.length !== 1 ? 's' : ''} at ${selectedSize}. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`tin-sleeves-${selectedSize}-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. The two existing callers pass no `countNote`, which is optional.

- [ ] **Step 3: Verify the existing suite still passes**

Run: `npx vitest run`
Expected: PASS. No existing test touches this component, so this is a regression check on the whole suite.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/tin-label-size-dialog.tsx
git commit -m "feat(print): tin labels use the shared fullscreen preview, gain Save PDF"
```

---

### Task 4: Bag sleeve dialog, replacing the silent download

**Files:**
- Create: `src/components/samples/print-bag-sleeves-dialog.tsx`
- Modify: `src/app/samples/qc/page.tsx` — `handleBulkPrintBagSleeves` at lines 588-636, and the dialog block near line 2124

**Interfaces:**
- Consumes: `BagSleeveEntry` from Task 1, `PrintPreviewDialog` from Task 2.
- Produces: `PrintBagSleevesDialog` with props
  `{ open: boolean; onOpenChange: (open: boolean) => void; entries: BagSleeveEntry[]; qrMode?: 'toggle' | 'rows'; onSuccess?: () => void }`.
  Task 5 renders it with `qrMode="toggle"`.

**Background the implementer needs.** Today `Print Bag Sleeves` silently downloads a PDF with no dialog and no preview, and reports failures through two `alert()` calls. All of that plumbing moves into the new component; the page keeps only the entry-building logic, which depends on page state (`selectedQrCodes`, `selectedSubContractQrCodes`, `samples`) and cannot move.

The QR rule differs per page and the dialog must not know which page it is on:
- `qrMode="rows"` (default, /samples) — the per-row checkbox column stays authoritative, so the dialog only reports the count it was given.
- `qrMode="toggle"` (/certificates) — a batch-wide checkbox, default ON, rewrites `includeQrCode` on every entry.

- [ ] **Step 1: Create the dialog**

Create `src/components/samples/print-bag-sleeves-dialog.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
import type { BagSleeveEntry } from '@/lib/print-selection'

interface PrintBagSleevesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fully resolved by the caller, including each entry's own includeQrCode. */
  entries: BagSleeveEntry[]
  /**
   * 'rows' (default) reports the caller's per-row QR selection read-only —
   * /samples has a QR checkbox column and that stays authoritative.
   * 'toggle' offers a batch-wide checkbox, default on — /certificates has no
   * such column, and every row there is certified so a QR always resolves.
   */
  qrMode?: 'toggle' | 'rows'
  onSuccess?: () => void
}

export function PrintBagSleevesDialog({
  open,
  onOpenChange,
  entries,
  qrMode = 'rows',
  onSuccess,
}: PrintBagSleevesDialogProps) {
  const [step, setStep] = useState<'config' | 'preview'>('config')
  const [includeQr, setIncludeQr] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setStep('config')
      setIncludeQr(true)
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    }
  }, [open])

  const qrRowCount = entries.filter(e => e.includeQrCode).length

  const handleGenerate = async () => {
    if (entries.length === 0) {
      toast.error('No samples selected')
      return
    }

    const payload =
      qrMode === 'toggle'
        ? entries.map(e => ({ ...e, includeQrCode: includeQr }))
        : entries

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-bag-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: payload }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.details || error.error || 'Failed to generate bag sleeves')
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setStep('preview')
    } catch (error) {
      console.error('Error generating bag sleeves:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate bag sleeves')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrinted = () => {
    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open && step === 'config'} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Print bag sleeves</DialogTitle>
            <DialogDescription>
              {entries.length} sleeve{entries.length !== 1 ? 's' : ''} — 6 per A4 sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {qrMode === 'toggle' ? (
              <div className="flex items-start gap-3 rounded-md border p-4">
                <Checkbox
                  id="bag-sleeve-qr"
                  checked={includeQr}
                  onCheckedChange={(checked) => setIncludeQr(checked === true)}
                />
                <div className="flex-1">
                  <Label htmlFor="bag-sleeve-qr" className="text-sm font-medium leading-none cursor-pointer">
                    Include QR code
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Prints the certificate QR on every sleeve in this batch.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                QR codes: {qrRowCount} of {entries.length} sleeve{entries.length !== 1 ? 's' : ''}.
                Use the QR column in the list to change this.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || entries.length === 0}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) onOpenChange(false) }}
        title="Print bag sleeves"
        subtitle={`${entries.length} sleeve${entries.length !== 1 ? 's' : ''}, 6 per A4 sheet. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
```

- [ ] **Step 2: Replace the page handler**

In `src/app/samples/qc/page.tsx`, replace the whole of `handleBulkPrintBagSleeves` (lines 588-636 — the version that fetches, builds a blob, creates an anchor and `alert()`s on failure) with a version that only builds entries and opens the dialog:

```tsx
  const handleBulkPrintBagSleeves = () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample')
      return
    }

    // Mother samples first, then any sub-contract whose QR column is ticked.
    // The per-row QR selection is authoritative here; the dialog only reports it.
    const entries: BagSleeveEntry[] = Array.from(selectedSamples).map(id => ({
      id,
      includeQrCode: selectedQrCodes.has(id),
    }))

    for (const sample of samples) {
      if (!selectedSamples.has(sample.id) || !sample.sub_contracts?.length) continue
      for (const sc of sample.sub_contracts) {
        if (selectedSubContractQrCodes.has(sc.id)) {
          entries.push({ id: sample.id, contractId: sc.id, includeQrCode: true })
        }
      }
    }

    setBagSleeveEntries(entries)
  }
```

- [ ] **Step 3: Add the state and imports**

Add next to the other dialog state near `src/app/samples/qc/page.tsx:217`:

```tsx
  const [bagSleeveEntries, setBagSleeveEntries] = useState<BagSleeveEntry[] | null>(null)
```

Add the imports beside the existing `PrintLabelsDialog` import at line 18:

```tsx
import { PrintBagSleevesDialog } from '@/components/samples/print-bag-sleeves-dialog'
import type { BagSleeveEntry } from '@/lib/print-selection'
```

- [ ] **Step 4: Render the dialog**

Add immediately after the `TinLabelSizeDialog` block that ends at line 2136:

```tsx
      {/* Bag sleeves for the current row selection. QR comes from the row
          checkboxes, so the dialog only reports the count. */}
      <PrintBagSleevesDialog
        open={!!bagSleeveEntries}
        onOpenChange={(next) => { if (!next) setBagSleeveEntries(null) }}
        entries={bagSleeveEntries || []}
        onSuccess={() => {
          setBagSleeveEntries(null)
          setSelectedSamples(new Set())
        }}
      />
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/print-bag-sleeves-dialog.tsx src/app/samples/qc/page.tsx
git commit -m "feat(print): bag sleeves preview before printing instead of silently downloading"
```

---

### Task 5: Tin Label and Bag Sleeves in the certificates bulk menu

**Files:**
- Modify: `src/app/certificates/page.tsx` — imports at lines 38-58, the bulk menu IIFE at lines 781-834, and the dialog block near line 1270

**Interfaces:**
- Consumes: `certificatesToTinSampleIds`, `certificatesToBagSleeveEntries` (Task 1); `TinLabelSizeDialog` with `countNote` (Task 3); `PrintBagSleevesDialog` (Task 4).
- Produces: nothing consumed by later tasks.

**Background the implementer needs.** The bulk menu already computes `selCerts` inside an IIFE at line 782, and already uses the "disabled item + explanatory line" pattern for `Send to buyer` / `Send to seller` — match it. `Printer` is **not** yet imported from lucide-react on this page; `Download`, `Mail` and `MoreVertical` are.

The dedupe note matters: a tin selection of 12 certificates across 7 lots produces 7 sheets. Without the note the operator counts 7 against 12 and reasonably concludes the print failed.

- [ ] **Step 1: Add the imports**

Add `Printer,` to the lucide-react import list at `src/app/certificates/page.tsx:38-58` (after `Pencil,`), and add below the `PrintTodayTinLabelsButton` import at line 56:

```tsx
import { TinLabelSizeDialog } from '@/components/samples/tin-label-size-dialog'
import { PrintBagSleevesDialog } from '@/components/samples/print-bag-sleeves-dialog'
import {
  certificatesToTinSampleIds,
  certificatesToBagSleeveEntries,
} from '@/lib/print-selection'
```

- [ ] **Step 2: Add the state and the note helper**

Add beside `const [selectedCertificates, ...]` at line 230:

```tsx
  const [tinLabelCerts, setTinLabelCerts] = useState<Certificate[] | null>(null)
  const [bagSleeveCerts, setBagSleeveCerts] = useState<Certificate[] | null>(null)
```

Add as a module-level function, above the page component:

```tsx
/**
 * One tin covers a whole lot, so a selection of a mother plus its splits prints
 * one label. Say so before generating: otherwise the operator counts seven
 * sheets against twelve ticked rows and concludes the print failed.
 */
function tinLabelCountNote(certs: Certificate[]): string | undefined {
  const ids = certificatesToTinSampleIds(certs)
  if (ids.length === certs.length) return undefined
  return `${certs.length} certificates -> ${ids.length} tin label${ids.length === 1 ? '' : 's'} (splits share their lot's label).`
}
```

- [ ] **Step 3: Add the two menu items**

Inside the IIFE at line 782, add after `const canSeller = ...`:

```tsx
                const tinSampleIds = certificatesToTinSampleIds(selCerts)
```

Then add inside `<DropdownMenuContent>`, immediately after the `Send to seller` block's trailing `{!canSeller && (...)}` at line 830:

```tsx
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={tinSampleIds.length === 0}
                        onClick={() => setTinLabelCerts(selCerts)}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Tin Label
                      </DropdownMenuItem>
                      {tinSampleIds.length === 0 && (
                        <div className="px-2 pb-1 text-xs text-muted-foreground">
                          Selected certificates have no linked sample
                        </div>
                      )}
                      <DropdownMenuItem
                        disabled={tinSampleIds.length === 0}
                        onClick={() => setBagSleeveCerts(selCerts)}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print Bag Sleeves (6 per A4)
                      </DropdownMenuItem>
```

- [ ] **Step 4: Render the two dialogs**

Add immediately after the closing `</Dialog>` of the Certificate Preview Modal (line 1265):

```tsx
        {/* Sleeve printing from a certificate selection. Tin labels dedupe to
            the lot — one tin covers a mother and all its splits — while bag
            sleeves print one per certificate, each carrying its own refs. */}
        <TinLabelSizeDialog
          open={!!tinLabelCerts}
          onOpenChange={(next) => { if (!next) setTinLabelCerts(null) }}
          sampleIds={tinLabelCerts ? certificatesToTinSampleIds(tinLabelCerts) : []}
          countNote={tinLabelCerts ? tinLabelCountNote(tinLabelCerts) : undefined}
          onSuccess={() => {
            setTinLabelCerts(null)
            setSelectedCertificates(new Set())
          }}
        />

        <PrintBagSleevesDialog
          open={!!bagSleeveCerts}
          onOpenChange={(next) => { if (!next) setBagSleeveCerts(null) }}
          entries={bagSleeveCerts ? certificatesToBagSleeveEntries(bagSleeveCerts, true) : []}
          qrMode="toggle"
          onSuccess={() => {
            setBagSleeveCerts(null)
            setSelectedCertificates(new Set())
          }}
        />
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, suite passes.

- [ ] **Step 6: Verify the file is still within the size guidance**

Run: `wc -l src/app/certificates/page.tsx`
Expected: under 1550. If it exceeds ~1900, stop and report — a split would be needed.

- [ ] **Step 7: Commit**

```bash
git add src/app/certificates/page.tsx
git commit -m "feat(certificates): print tin labels and bag sleeves from the bulk menu"
```

---

### Task 6: Sample labels through the shell

**Files:**
- Modify: `src/components/samples/print-labels-dialog.tsx` (whole file)

**Interfaces:**
- Consumes: `PrintPreviewDialog` from Task 2.
- Produces: no prop changes. `src/app/samples/qc/page.tsx:2117` is untouched.

**What changes.** Today this dialog has two buttons that each re-fetch the same PDF: `Download PDF` writes a file, `Print` opens a stray tab. Both fetches collapse into one `Continue`, and the shell's footer supplies Save and Print from the single blob.

- [ ] **Step 1: Replace the file**

Overwrite `src/components/samples/print-labels-dialog.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'

interface PrintLabelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  onSuccess?: () => void
}

export function PrintLabelsDialog({
  open,
  onOpenChange,
  sampleIds,
  onSuccess,
}: PrintLabelsDialogProps) {
  const [step, setStep] = useState<'config' | 'preview'>('config')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setStep('config')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to generate labels')
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setStep('preview')
    } catch (error) {
      console.error('Error generating labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate labels')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrinted = () => {
    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open && step === 'config'} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Print Sample Labels</DialogTitle>
            <DialogDescription>
              Generate printable labels for {sampleIds.length} selected sample
              {sampleIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>QR codes will be generated for sample tracking</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>
                  Type-specific fields: Exporter, Quality, Contracts, Container/OIC (SS), Bags
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span>Format: 4cm x A4 with cut guides (fits 7 labels per page)</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) onOpenChange(false) }}
        title="Print sample labels"
        subtitle={`${sampleIds.length} label${sampleIds.length !== 1 ? 's' : ''}, 7 per A4 sheet. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`sample-labels-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, suite passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/samples/print-labels-dialog.tsx
git commit -m "feat(print): sample labels preview in the shared module, one fetch instead of two"
```

---

### Task 7: Cupping cards through the shell

**Files:**
- Modify: `src/components/cupping/print-cupping-cards-dialog.tsx` — imports at lines 1-35, `handlePrintPreview` at lines 561-597, and the render block from line 613

**Interfaces:**
- Consumes: `PrintPreviewDialog` from Task 2.
- Produces: no prop changes. `src/app/samples/qc/page.tsx:2139` is untouched.

**Background the implementer needs.** This dialog renders its PDF client-side with `@react-pdf/renderer` into `previewUrl`, and can produce **several** documents (`documents[]`, switched by `activeDocIndex`) — the pill row currently sits above the iframe and must move into the shell's `headerExtra`.

The stage commit is the delicate part. On the first confirmed print the batch advances to `analysis` and `cards_printed_at` is stamped, guarded by `stageCommittedRef` and `stageCommitInFlightRef`. All of that stays; only the `frame.contentWindow.print()` call and its `window.open` fallback leave, because the shell now owns them. Since `onPrinted` never fires from Save, saving a card no longer risks advancing a stage.

- [ ] **Step 1: Add the import**

Add after the `Button` import near line 16:

```tsx
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
```

- [ ] **Step 2: Replace `handlePrintPreview` with `handlePrinted`**

Replace the whole of `handlePrintPreview` (lines 561-597) with:

```tsx
  // Runs after the shell has opened the browser print dialog. Never runs on
  // Save, so saving a card to check it cannot advance the batch's stage.
  const handlePrinted = () => {
    setHasPrinted(true)

    // Advance the batch to 'analysis' + stamp cards_printed_at on the FIRST
    // confirmed print, fire-and-forget. The in-flight ref guards a rapid
    // double-click from firing two commits; a failed commit is retried on the
    // next print (stageCommittedRef only flips on success).
    if (
      !stageCommittedRef.current &&
      !stageCommitInFlightRef.current &&
      cardData &&
      cardData.length > 0
    ) {
      stageCommitInFlightRef.current = true
      const ids = cardData.map(c => c.sample_id)
      updateSampleStatuses(ids)
        .then(ok => {
          if (ok) stageCommittedRef.current = true
        })
        .finally(() => {
          stageCommitInFlightRef.current = false
        })
    }
  }
```

- [ ] **Step 3: Split the render into config dialog + shell**

Change the outer `<Dialog open={open} ...>` to render only when the config step is showing, and drop the width switch on `DialogContent`:

```tsx
    <Dialog open={open && !showPreview} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
```

Then in the body, delete the entire `showPreview ? (...) : (` branch — the pill row, the `h-[68vh]` iframe container and its loading/error text — leaving only the configuration content that follows, so the block becomes:

```tsx
        <div className="space-y-6 py-4">
          {/* Selected Samples Preview */}
```

with the matching `)}` of the removed ternary deleted too. Update the description to drop its preview wording:

```tsx
          <DialogDescription>
            {`Configure and print cupping cards for ${samples.length} sample${samples.length !== 1 ? 's' : ''}`}
          </DialogDescription>
```

Delete the now-unused `iframeRef` declaration and, if nothing else references it, the `cn` import.

- [ ] **Step 4: Render the shell alongside**

Wrap the returned JSX in a fragment and add after the closing `</Dialog>`:

```tsx
      <PrintPreviewDialog
        open={open && showPreview}
        onOpenChange={(next) => { if (!next) handleOpenChange(false) }}
        title="Print cupping cards"
        subtitle={`${samples.length} card${samples.length !== 1 ? 's' : ''} — review, then print. Saving is optional.`}
        pdfUrl={previewUrl}
        loading={previewLoading}
        error={previewError}
        saveFileName={`cupping-cards-${new Date().toISOString().split('T')[0]}.pdf`}
        headerExtra={
          documents.length > 1 ? (
            <div className="flex items-center gap-2">
              {documents.map((doc, i) => (
                <button
                  key={doc.key}
                  type="button"
                  onClick={() => setActiveDocIndex(i)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    i === activeDocIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {doc.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
        onPrinted={handlePrinted}
      />
```

Keep the `cn` import — this block uses it.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, suite passes. If `tsc` reports an unused `iframeRef` or a dangling `Printer`/`Download` import, remove them.

- [ ] **Step 6: Commit**

```bash
git add src/components/cupping/print-cupping-cards-dialog.tsx
git commit -m "feat(print): cupping card preview uses the shared fullscreen module"
```

---

### Task 8: Certificate previews and the cert-editor label print

**Files:**
- Modify: `src/app/certificates/page.tsx` — the preview modal at lines 1207-1265
- Modify: `src/components/certificates/cert-editor/use-sample-actions.ts` — `handlePrintLabel` at lines 132-152, return block at lines 309-326
- Modify: `src/components/certificates/cert-editor/sample-actions.tsx` — the certificate preview Dialog at lines 97-130

**Interfaces:**
- Consumes: `PrintPreviewDialog` from Task 2.
- Produces: `useSampleActions` returns two new fields — `labelPdfUrl: string | null` and `closeLabelPreview: () => void`.

**Background the implementer needs.** There are **three** surfaces here, not two. Besides the eye-icon preview on `/certificates` and the cert-editor's `Print label`, the cert-editor has its own certificate preview modal at `sample-actions.tsx:98` (`showCertificateModal`). All three get the shell.

Both certificate previews already have a working `Download` that goes through the certificate endpoint and names the file from the certificate number — better than anything the shell could construct. Pass those as `onSave` rather than replacing them. Both also have a `Send Email` button, which goes in `footerExtra`.

`handlePrintLabel` currently opens a stray tab via `window.open`. It becomes a blob URL held in state and rendered in the shell.

- [ ] **Step 1: Convert the /certificates eye-icon preview**

In `src/app/certificates/page.tsx`, replace the entire `{/* Certificate Preview Modal */}` block (lines 1207-1265, from `<Dialog open={!!previewCertificate}` through its closing `</Dialog>`) with:

```tsx
        {/* Certificate Preview */}
        <PrintPreviewDialog
          open={!!previewCertificate}
          onOpenChange={(next) => { if (!next) handleClosePreview() }}
          title={`Certificate ${previewCertificate?.certificate_number ?? ''}`}
          subtitle={[
            previewCertificate?.sample?.origin ? `Origin: ${previewCertificate.sample.origin}` : null,
            previewCertificate?.sample?.client
              ? `Client: ${previewCertificate.sample.client.fantasy_name ||
                  previewCertificate.sample.client.company ||
                  previewCertificate.sample.client.name}`
              : null,
          ].filter(Boolean).join('   ') || undefined}
          pdfUrl={previewPdfUrl}
          saveFileName={`${previewCertificate?.certificate_number ?? 'certificate'}.pdf`}
          // The existing download names the file from the certificate number
          // via the download endpoint — better than anything built here.
          onSave={
            previewCertificate?.sample_id
              ? () => handleDownload(
                  previewCertificate.sample_id!,
                  previewCertificate.certificate_number,
                  previewCertificate.sample_contract_id,
                )
              : undefined
          }
          footerExtra={
            previewCertificate?.sample_id ? (
              <Button variant="outline" onClick={() => setShowSingleEmailDialog(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            ) : undefined
          }
        />
```

Add to the imports added in Task 5:

```tsx
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
```

- [ ] **Step 2: Hold the label PDF in state instead of opening a tab**

In `src/components/certificates/cert-editor/use-sample-actions.ts`, add beside the other state declarations:

```ts
  const [labelPdfUrl, setLabelPdfUrl] = useState<string | null>(null)
```

Replace `handlePrintLabel` (lines 132-152) with:

```ts
  const handlePrintLabel = async () => {
    try {
      setPrintingLabel(true)
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: [sample.id] }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to generate label')
      const blob = await response.blob()
      setLabelPdfUrl(prev => {
        if (prev) window.URL.revokeObjectURL(prev)
        return window.URL.createObjectURL(blob)
      })
    } catch (error) {
      console.error('Error printing label:', error)
      toast({ title: 'Print failed', description: error instanceof Error ? error.message : 'Failed to print label', variant: 'destructive' })
    } finally {
      setPrintingLabel(false)
    }
  }

  const closeLabelPreview = () => {
    setLabelPdfUrl(prev => {
      if (prev) window.URL.revokeObjectURL(prev)
      return null
    })
  }
```

Change the return block's print line (line 319) to:

```ts
    printingLabel, handlePrintLabel, labelPdfUrl, closeLabelPreview, handleExport,
```

- [ ] **Step 3: Convert both cert-editor dialogs**

In `src/components/certificates/cert-editor/sample-actions.tsx`, add the import:

```tsx
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
```

Replace the `{/* Certificate preview */}` Dialog block (lines 97-130) with:

```tsx
      {/* Certificate preview */}
      <PrintPreviewDialog
        open={a.showCertificateModal}
        onOpenChange={(o) => { if (!o) a.handleClosePreview() }}
        title={`Certificate ${a.parseTrackingNumber(sample.tracking_number)}`}
        subtitle={[
          sample.origin ? `Origin: ${sample.origin}` : null,
          sample.quality_name ? `Quality: ${sample.quality_name}` : null,
        ].filter(Boolean).join('   ') || undefined}
        pdfUrl={a.previewPdfUrl}
        loading={a.previewLoading}
        saveFileName={`${a.parseTrackingNumber(sample.tracking_number)}.pdf`}
        onSave={a.handleDownloadCertificate}
        footerExtra={
          <Button variant="outline" onClick={() => a.setShowEmailDialog(true)}>
            <Mail className="mr-2 h-4 w-4" /> Send Email
          </Button>
        }
      />

      {/* Sample label preview */}
      <PrintPreviewDialog
        open={!!a.labelPdfUrl}
        onOpenChange={(o) => { if (!o) a.closeLabelPreview() }}
        title={`Sample label ${a.parseTrackingNumber(sample.tracking_number)}`}
        subtitle="One label, 4cm on A4 with cut guides."
        pdfUrl={a.labelPdfUrl}
        saveFileName={`${a.parseTrackingNumber(sample.tracking_number)}-label.pdf`}
      />
```

If `tsc` then reports `FileText`, `Loader2` or `Download` as unused in this file, remove them from the lucide-react import.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, suite passes.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds. This is the first task touching three files at once, and the certificates page in particular.

- [ ] **Step 6: Commit**

```bash
git add src/app/certificates/page.tsx src/components/certificates/cert-editor/use-sample-actions.ts src/components/certificates/cert-editor/sample-actions.tsx
git commit -m "feat(print): certificate previews and cert-editor label print use the shared module"
```

---

### Task 9: Manual QA on production

Everything above is unit-tested or type-checked, but nothing has put ink on paper. This task is the one that catches a wrong sheet count or a split printing its mother's references.

**Files:** none.

- [ ] **Step 1: Push**

```bash
git push origin main
```

Vercel auto-deploys `main` to production.

- [ ] **Step 2: Verify the certificates bulk menu**

On `/certificates`, select a mother certificate together with two of its split certificates (the screenshot's `BD1-001119/26` … `BD1-001123/26` rows share contract `002/1251/0062`). Open `Actions`. Confirm:
- `Tin Label` and `Print Bag Sleeves (6 per A4)` appear below `Send to seller`.
- `Tin Label` opens the small size dialog and its description reads `3 certificates -> 1 tin label (splits share their lot's label).`
- `Continue` opens a fullscreen preview showing **one** label whose `Cert.` field lists all three certificate numbers.
- Esc closes it; reopening and using the X closes it too.

- [ ] **Step 3: Verify bag sleeves carry per-split references**

With the same selection, choose `Print Bag Sleeves`. Confirm the QR checkbox is present and ticked, `Continue` produces **three** sleeves, and each split's sleeve shows its own tracking number and contract references rather than the mother's. Untick the QR box, regenerate, confirm the QR is gone.

- [ ] **Step 4: Verify Save does not consume a batch**

Note the count on the `Today · N` button. Open `Tin Label` for a certified lot, press `Save PDF` in the preview, close with Esc, and reload. The `Today · N` count must be **unchanged** — this is the safety property the whole design rests on. Then press `Print` on the same batch and confirm the count drops.

- [ ] **Step 5: Verify the other surfaces**

On `/samples/qc`, confirm each of `Reprint Cupping Cards`, `Tin Label` and `Print Bag Sleeves` opens its small config dialog and then a fullscreen preview, that X and Esc both close each one, and that bag sleeves no longer drop a file into Downloads without asking. In the cert editor, confirm `Print label` and the certificate preview both open fullscreen with no stray browser tab.

- [ ] **Step 6: Print one physical sheet**

Print one tin label sheet and one bag sleeve sheet on the lab printer and check the physical output against a tin and a bag. Nothing in this work changed page geometry, so any drift here is a regression to report, not a tuning exercise.

---

## Self-Review

**Spec coverage.** Part A (shared shell) → Task 2. Part B (selection mapping) → Task 1. Part C (certificates bulk menu, dedupe note) → Task 5. Part D, all six surfaces → Tasks 3, 4, 5, 6, 7, 8. Error handling → folded into each dialog's `toast.error` / shell error state. Testing → Tasks 1, 2 unit; Task 9 manual. Size impact → checked in Task 5 Step 6.

**One addition beyond the spec.** The cert-editor's own certificate preview (`sample-actions.tsx:98`) was not in the spec's table of six surfaces — it was found while reading the file for the `Print label` conversion. It is the same kind of surface and is converted in Task 8, making seven.

**Two props beyond the spec.** `footerExtra` on the shell, needed to preserve the `Send Email` button both certificate previews already have; and `countNote` on `TinLabelSizeDialog`, which is how the spec's dedupe line actually reaches the UI.
