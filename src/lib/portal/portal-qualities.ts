import { reasonsOfViolation, type RejectionReasonKey } from '@/lib/reports/rejection-reasons'
import { pendingVersion, versionInForce } from '@/lib/quality-spec/pick-version'
import type { VersionRow } from '@/lib/quality-spec/types'
import { NOT_RECORDED, type PortalCertFact } from './portal-facts'

export type ClientSectionId = 'screen' | 'green' | 'roast' | 'defects' | 'physical' | 'cupping' | 'taints' | 'clean'
export const CLIENT_SECTIONS: readonly ClientSectionId[] = [
  'screen', 'green', 'roast', 'defects', 'physical', 'cupping', 'taints', 'clean',
]
export const SECTION_REASONS: Record<ClientSectionId, RejectionReasonKey[]> = {
  screen: ['screen'],
  green: [],
  roast: [],
  defects: ['primary', 'secondary'],
  physical: ['moisture', 'quakers'],
  cupping: ['cup_score'],
  taints: ['cup_fault', 'cup_taint'],
  clean: [],
}

export interface QualityListRow {
  id: string
  name: string
  origin: string
  versionNo: number | null
  scheduled: { versionNo: number; effectiveFrom: string } | null
  certificates: number
  approvedCertificates: number
  pssApprovedPct: number | null
  ssApprovedPct: number | null
}

const pct = (facts: PortalCertFact[]): number | null =>
  facts.length === 0 ? null : Math.round((facts.filter((f) => !f.rejected).length / facts.length) * 100)

export function buildQualityList(
  facts: PortalCertFact[],
  qualities: { id: string; name: string; origin: string | null; versions: VersionRow[] }[],
  today: string,
): QualityListRow[] {
  const rows = qualities.map((q): QualityListRow => {
    const mine = facts.filter((f) => f.qualitySpecId === q.id)
    const inForce = versionInForce(q.versions, today)
    const pending = pendingVersion(q.versions, today)
    return {
      id: q.id,
      name: q.name,
      origin: q.origin?.trim() || NOT_RECORDED,
      versionNo: inForce?.version_no ?? null,
      scheduled: pending && pending.effective_from > today
        ? { versionNo: pending.version_no, effectiveFrom: pending.effective_from }
        : null,
      certificates: mine.length,
      approvedCertificates: mine.filter((f) => !f.rejected).length,
      pssApprovedPct: pct(mine.filter((f) => f.type === 'pss')),
      ssApprovedPct: pct(mine.filter((f) => f.type === 'ss')),
    }
  })
  return rows.sort((a, b) => a.origin.localeCompare(b.origin) || a.name.localeCompare(b.name))
}

export function buildOriginSummary(
  rows: QualityListRow[],
): { origin: string; qualities: number; certificates: number; approvedPct: number | null }[] {
  const by = new Map<string, QualityListRow[]>()
  for (const r of rows) by.set(r.origin, [...(by.get(r.origin) ?? []), r])
  return [...by.entries()].map(([origin, list]) => {
    const certificates = list.reduce((n, r) => n + r.certificates, 0)
    const approved = list.reduce((n, r) => n + r.approvedCertificates, 0)
    return {
      origin,
      qualities: list.length,
      certificates,
      approvedPct: certificates > 0 ? Math.round((approved / certificates) * 100) : null,
    }
  })
}

/** Per section: lots of this quality that broke none of the section's rules. Null where no rule maps. */
export function sectionCompliance(
  facts: PortalCertFact[],
  qualityId: string,
): Record<ClientSectionId, { within: number; lots: number } | null> {
  const mine = facts
    .filter((f) => f.qualitySpecId === qualityId)
    .map((f) => new Set(f.complianceViolations.flatMap((v) => reasonsOfViolation(v))))
  const out = {} as Record<ClientSectionId, { within: number; lots: number } | null>
  for (const id of CLIENT_SECTIONS) {
    const reasons = SECTION_REASONS[id]
    out[id] = reasons.length === 0
      ? null
      : { within: mine.filter((set) => !reasons.some((r) => set.has(r))).length, lots: mine.length }
  }
  return out
}

export interface PortalVersionView {
  id: string
  versionNo: number
  effectiveFrom: string
  status: 'in_force' | 'scheduled' | 'past' | 'cancelled'
  changedBy: string
  note: string | null
  cancelNote: string | null
}

/** Free text must never show an internal SAN lab number. */
export const noSan = (t: string | null): string | null =>
  t === null ? null : t.replace(/(?:R-)?SAN-\d+\/\d+/gi, '').replace(/\s{2,}/g, ' ').trim()

export function versionViews(versions: VersionRow[], today: string, names: Map<string, string>): PortalVersionView[] {
  const inForce = versionInForce(versions, today)
  return [...versions]
    .sort((a, b) => b.version_no - a.version_no)
    .map((v): PortalVersionView => ({
      id: v.id,
      versionNo: v.version_no,
      effectiveFrom: v.effective_from,
      status: v.cancelled_at ? 'cancelled'
        : inForce?.id === v.id ? 'in_force'
        : !v.applied_at && v.effective_from > today ? 'scheduled'
        : 'past',
      changedBy: v.source === 'client' ? (v.created_by && names.get(v.created_by)) || 'Client' : 'Wolthers',
      note: noSan(v.note),
      cancelNote: noSan(v.cancel_note),
    }))
}
