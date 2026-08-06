'use client'

import { useState, useEffect, useRef } from 'react'
import type { CertificateView } from './types'

/**
 * A plain, heavy download arrow.
 *
 * The glyph this replaces (⤓) rendered tiny and inconsistently across phones —
 * it is a rare codepoint, so a fallback font usually drew it. An inline SVG is
 * the same size everywhere and scales with the button.
 */
function DownArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="4" x2="12" y2="17" />
      <polyline points="6 12 12 18 18 12" />
    </svg>
  )
}

/** Counts read neutral at zero and red above it; booleans read green or red. */
function chipClass(value: number | boolean | null): string {
  if (value === true) return 'text-[#5fae63]'
  if (value === false) return 'text-[#d9534f]'
  if (typeof value === 'number' && value > 0) return 'text-[#d9534f]'
  return 'text-[#f2efe6]'
}

/**
 * Cup integrity at a glance, plus the way to the PDF.
 *
 * Pinned to the bottom because these four numbers are what a buyer asks about
 * second, after the verdict. The page reserves scroll padding equal to this
 * footer's height so the last cupping rail is never trapped behind it.
 */
export function CertificateFooter({ view }: { view: CertificateView }) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Tracks whether the modal has ever been opened, so the focus-return
  // effect below can tell "just closed" apart from "just mounted" — both
  // are `open === false`, but only one should move focus.
  const hasOpened = useRef(false)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (open) {
      hasOpened.current = true
      return
    }
    if (hasOpened.current) openerRef.current?.focus()
  }, [open])

  const handleShare = async () => {
    const url = window.location.href
    const title = `${view.certificateNumber ?? view.reference} — ${view.status}`
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (err) {
        // AbortError means the user dismissed the share sheet on purpose —
        // respect that and stop, rather than copying a link they chose not
        // to share. Any other rejection (unsupported, permission denied,
        // etc.) still falls through to the clipboard.
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Nothing sensible left to try.
    }
  }

  const chips: Array<{ k: string; v: string; state: number | boolean | null }> = [
    { k: 'Taints', v: view.taints === null ? '–' : String(view.taints), state: view.taints },
    { k: 'Faults', v: view.faults === null ? '–' : String(view.faults), state: view.faults },
    {
      k: 'Clean',
      v: view.cleanCup === null ? '–' : view.cleanCup ? 'Yes' : 'No',
      state: view.cleanCup,
    },
    {
      k: 'Uniform',
      v: view.uniformCup === null ? '–' : view.uniformCup ? 'Yes' : 'No',
      state: view.uniformCup,
    },
  ]

  return (
    <>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-[#333331] border-t border-[#4a4a47] shadow-[0_-14px_22px_-8px_rgba(0,0,0,0.55)] pb-[env(safe-area-inset-bottom)] z-30">
        <div className="flex items-stretch py-[7px] pr-2">
          {chips.map((chip, i) => (
            <div
              key={chip.k}
              className={`flex-1 min-w-0 px-0.5 py-0.5 text-center flex flex-col justify-center relative ${
                i > 0 ? 'before:content-[""] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-[#3f3f3c]' : ''
              }`}
            >
              <div className="text-[9px] tracking-[0.07em] uppercase text-[#7c7a73] mb-px truncate">
                {chip.k}
              </div>
              <div className={`text-sm font-bold tabular-nums leading-tight ${chipClass(chip.state)}`}>
                {chip.v}
              </div>
            </div>
          ))}
          <button
            ref={openerRef}
            onClick={() => setOpen(true)}
            aria-label="Open certificate"
            className="flex-none ml-2 w-[58px] min-h-[44px] flex flex-col items-center justify-center gap-px bg-[#6d7f37] text-white rounded-[10px] active:bg-[#5d6c2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
          >
            <DownArrow className="w-[18px] h-[18px]" />
            <span className="text-[9px] tracking-[0.08em] font-bold">PDF</span>
          </button>
        </div>
      </div>

      {open && (
        // Full screen, not a centred card: an A4 page in a 388px box on a
        // phone is unreadable, and the reason to open it at all is to read it.
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cert-modal-title"
          className="fixed inset-0 z-50 bg-[#262625] flex flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
        >
          <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-[#3f3f3c] bg-[#333331] pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <div className="text-[9.5px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold">
                {view.certificateNumber ? 'Certificate' : view.eyebrow}
              </div>
              <div id="cert-modal-title" className="text-[17px] font-bold tracking-[-0.01em] text-[#f2efe6] truncate">
                {view.certificateNumber ?? view.reference}
              </div>
            </div>
            <button
              ref={closeRef}
              onClick={() => setOpen(false)}
              aria-label="Close certificate"
              className="flex-none w-10 h-10 rounded-full bg-[#3b3b39] text-[#f2efe6] text-lg active:bg-[#4a4a47] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">&#10005;</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto bg-[#1c1c1b] p-2">
            <iframe
              src={view.pdfUrl}
              title={`Certificate ${view.certificateNumber ?? view.reference}`}
              className="w-full h-full min-h-[60vh] bg-[#f6f4ee] rounded"
            />
          </div>

          <div className="flex gap-2.5 px-4 py-3 border-t border-[#3f3f3c] bg-[#333331] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <a
              href={view.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2.5 p-3.5 rounded-xl bg-[#6d7f37] text-white text-[15px] font-semibold active:bg-[#5d6c2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
            >
              <DownArrow className="w-[22px] h-[22px]" />
              Download
            </a>
            <button
              onClick={handleShare}
              aria-label="Share certificate"
              className="flex-none w-[52px] flex items-center justify-center p-3.5 rounded-xl bg-[#333331] text-[#f2efe6] border border-[#4a4a47] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:outline-offset-2"
            >
              <span aria-hidden="true">&#8599;</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
