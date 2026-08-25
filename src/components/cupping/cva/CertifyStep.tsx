'use client'

/**
 * The last stop in the specialty (SCA CVA 2024) journey: certify the lot, or
 * override the cup's own reading with a comment.
 *
 * Visual language borrowed from ScoreSummary.tsx — same card radius, the same
 * uppercase/tracked micro-labels, the same tabular-nums score treatment — so
 * Certify reads as the natural next page after the reveal, not a bolted-on form.
 */
import { useState } from 'react'
import type { CvaOverride } from '@/lib/cupping/cva-verdict'

export type { CvaOverride }

interface CertifyStepProps {
  /** The lot's own reference — never the internal SAN- lab number. */
  reference: string
  /** The live CVA score, 0–100. Provisional (not yet the certified reading)
   *  until every section has been scored. */
  score: number
  /** Wolthers/contract pass mark (quality_templates.cva_min_score). null = unset. */
  minScore: number | null
  /** Whether this viewer may certify at all. Hides BOTH actions entirely when
   *  false — this is a UI affordance only, the finalize route re-checks the
   *  same rule server-side independently. */
  canFinalize: boolean
  /** null = certify with no override. An override always carries a decision
   *  and a non-empty comment — see CvaOverride. */
  onCertify: (override: CvaOverride | null) => void
}

/**
 * Three distinct calls on the cup, never two collapsed into one:
 *  - 'passes'      — score meets or exceeds the mark
 *  - 'falls-short' — score is below the mark
 *  - 'unjudged'    — no mark is configured at all, so the cup CANNOT be judged.
 *                    This is not the same claim as failing.
 *
 * This mirrors the server's CvaVerdict (`cupPassed: boolean | null`, see
 * cva-verdict.ts) one-for-one, but as a discriminated union instead of a
 * nullable boolean — there is no `false`/`null` pair here to collapse by
 * accident with a stray `!` or a truthy ternary.
 */
type CupCall =
  | { kind: 'passes'; mark: number }
  | { kind: 'falls-short'; mark: number }
  | { kind: 'unjudged' }

function callTheCup(score: number, minScore: number | null): CupCall {
  if (minScore == null) return { kind: 'unjudged' }
  return score >= minScore ? { kind: 'passes', mark: minScore } : { kind: 'falls-short', mark: minScore }
}

const CALL_COLOR: Record<CupCall['kind'], string> = {
  passes: '#22c55e',
  'falls-short': '#ef4444',
  unjudged: 'var(--cva-hair)',
}

function verdictLine(call: CupCall): string {
  switch (call.kind) {
    case 'passes':
      return `Passes the ${call.mark} pass mark`
    case 'falls-short':
      return `Falls below the ${call.mark} pass mark`
    case 'unjudged':
      return 'This quality has no CVA pass mark set — the cup cannot be judged.'
  }
}

export function CertifyStep({ reference, score, minScore, canFinalize, onCertify }: CertifyStepProps) {
  const [overriding, setOverriding] = useState(false)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState(false)

  const call = callTheCup(score, minScore)
  const color = CALL_COLOR[call.kind]

  const closeOverride = () => {
    setOverriding(false)
    setComment('')
    setCommentError(false)
  }

  const submitOverride = (decision: CvaOverride['decision']) => {
    const trimmed = comment.trim()
    if (trimmed === '') {
      setCommentError(true)
      return
    }
    onCertify({ decision, comment: trimmed })
  }

  return (
    <div className="flex w-full max-w-[640px] flex-col items-center gap-6 text-center">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[3px] text-muted-foreground">
          Certify this lot
        </div>
        <div className="mt-1 text-[13px] font-semibold text-foreground">{reference}</div>
      </div>

      <div className="flex w-full flex-col items-center gap-3 rounded-[20px] border border-border bg-card px-8 py-7">
        <div className="text-[clamp(48px,10vw,80px)] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
          {score.toFixed(2)}
        </div>
        <div className="rounded-[14px] px-4 py-1.5 text-[13px] font-bold text-white" style={{ background: color }}>
          {verdictLine(call)}
        </div>
      </div>

      {canFinalize && !overriding && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onCertify(null)}
            className="rounded-[16px] px-7 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5"
            style={{ background: 'var(--cva-accent)', boxShadow: '0 6px 18px var(--cva-accent-soft)' }}
          >
            Certify
          </button>
          <button
            type="button"
            onClick={() => setOverriding(true)}
            className="rounded-[16px] border border-border px-6 py-3 text-sm font-bold text-muted-foreground transition hover:border-[var(--cva-accent)] hover:text-foreground"
          >
            Override
          </button>
        </div>
      )}

      {canFinalize && overriding && (
        <div className="flex w-full flex-col gap-3 rounded-[20px] border border-border bg-card p-5 text-left">
          <label className="flex flex-col gap-1.5 text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
            Override comment — required
            <textarea
              value={comment}
              onChange={(e) => {
                setComment(e.target.value)
                if (commentError) setCommentError(false)
              }}
              placeholder="Why does this decision override the cup's own reading?"
              rows={3}
              className="rounded-[14px] border border-border bg-background px-4 py-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-[var(--cva-accent)]"
            />
          </label>
          {commentError && (
            <p className="text-[12.5px] font-semibold" style={{ color: '#ef4444' }}>
              An override comment is required.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeOverride}
              className="rounded-[16px] border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submitOverride('rejected')}
              className="rounded-[16px] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5"
              style={{ background: '#ef4444' }}
            >
              Reject this lot
            </button>
            <button
              type="button"
              onClick={() => submitOverride('approved')}
              className="rounded-[16px] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5"
              style={{ background: '#22c55e' }}
            >
              Approve this lot
            </button>
          </div>
        </div>
      )}

      {!canFinalize && (
        <p className="text-[12.5px] text-muted-foreground">You do not have permission to certify this lot.</p>
      )}
    </div>
  )
}
