'use client'

/**
 * The last stop in the specialty (SCA CVA 2024) journey: certify the lot, or
 * override the cup's own reading with a comment.
 *
 * Visual language borrowed from ScoreSummary.tsx — same card radius, the same
 * uppercase/tracked micro-labels, the same tabular-nums score treatment — so
 * Certify reads as the natural next page after the reveal, not a bolted-on form.
 */
import { useEffect, useRef, useState } from 'react'
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
  /** True while a previous Certify/Override click is still waiting on the
   *  server. Freezes every action here with visible in-flight feedback —
   *  without it, a second click during the round trip was silently dropped by
   *  the caller's own re-entrancy guard, with nothing on screen to explain why. */
  busy?: boolean
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

/**
 * Same dark neutral as SCORE_ACCENT (CvaJourney's own Score/Certify accent)
 * and the CLAUDE.md chart palette's dark tone. Deliberately NOT `--cva-hair`:
 * that token is a near-transparent hairline/status-dot tint
 * (rgba(0,0,0,.06) in light mode, meant for 1px dividers and 8px dots) — used
 * as a solid pill fill it composited to a pale grey over the card background,
 * making white text on it close to unreadable in light mode. #151618 holds
 * ~18:1 contrast against white text in both themes.
 */
const UNJUDGED_COLOR = '#151618'

const CALL_COLOR: Record<CupCall['kind'], string> = {
  passes: '#22c55e',
  'falls-short': '#ef4444',
  unjudged: UNJUDGED_COLOR,
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

type PendingAction = 'certify' | 'approve' | 'reject' | null

export function CertifyStep({ reference, score, minScore, canFinalize, busy = false, onCertify }: CertifyStepProps) {
  const [overriding, setOverriding] = useState(false)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const call = callTheCup(score, minScore)
  const color = CALL_COLOR[call.kind]

  const closeOverride = () => {
    setOverriding(false)
    setComment('')
    setCommentError(false)
  }

  // Once a request resolves (busy goes true -> false), reset the override
  // form: whether it succeeded or failed, a stale open form with a typed
  // comment is confusing, and the caller's own toast already explains what
  // happened. Clicking Override again re-opens a fresh field to retry.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      setPendingAction(null)
      closeOverride()
    }
    wasBusy.current = busy
    // closeOverride is a fresh function each render; only busy should re-arm this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  const certify = () => {
    setPendingAction('certify')
    onCertify(null)
  }

  const submitOverride = (decision: CvaOverride['decision']) => {
    const trimmed = comment.trim()
    if (trimmed === '') {
      setCommentError(true)
      return
    }
    setPendingAction(decision === 'approved' ? 'approve' : 'reject')
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
            disabled={busy}
            onClick={certify}
            className="rounded-[16px] px-7 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
            style={{ background: 'var(--cva-accent)', boxShadow: '0 6px 18px var(--cva-accent-soft)' }}
          >
            {pendingAction === 'certify' ? 'Certifying…' : 'Certify'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOverriding(true)}
            className="rounded-[16px] border border-border px-6 py-3 text-sm font-bold text-muted-foreground transition hover:border-[var(--cva-accent)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
              disabled={busy}
              className="rounded-[14px] border border-border bg-background px-4 py-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-[var(--cva-accent)] disabled:opacity-50"
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
              disabled={busy}
              onClick={closeOverride}
              className="rounded-[16px] border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submitOverride('rejected')}
              className="rounded-[16px] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              style={{ background: '#ef4444' }}
            >
              {pendingAction === 'reject' ? 'Rejecting…' : 'Reject this lot'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submitOverride('approved')}
              className="rounded-[16px] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              style={{ background: '#22c55e' }}
            >
              {pendingAction === 'approve' ? 'Approving…' : 'Approve this lot'}
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
