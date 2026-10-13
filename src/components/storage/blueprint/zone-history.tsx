'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ZoneEvent } from '@/lib/storage/zone-changes'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SHOWN_CODES = 8
const MAX_EVENTS = 100

/** One history line: "13 Oct 14:02", who, and "B-A1, B-A2: General → Ahold" (local time). */
export function zoneEventLine(e: ZoneEvent): { when: string; who: string; what: string } {
  const d = new Date(e.changed_at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const when = `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const codes = [...e.codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const more = codes.length > SHOWN_CODES ? ` +${codes.length - SHOWN_CODES} more` : ''
  const what = `${codes.slice(0, SHOWN_CODES).join(', ')}${more}: ${e.from_name ?? 'General'} → ${e.to_name ?? 'General'}`
  return { when, who: e.changed_by_name, what }
}

/** Zone changes for one shelf (`shelfId`) or the whole lab (null), newest first; reloads when `token` changes. */
export function ZoneHistory({ laboratoryId, shelfId, pageSize, token }: {
  laboratoryId: string; shelfId: string | null; pageSize: number; token: number
}) {
  const [limit, setLimit] = useState(pageSize)
  const [events, setEvents] = useState<ZoneEvent[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => { setLimit(pageSize) }, [shelfId, pageSize])

  useEffect(() => {
    let alive = true
    const shelf = shelfId ? `&shelf=${shelfId}` : ''
    fetch(`/api/laboratories/${laboratoryId}/storage/zone-history?limit=${limit}${shelf}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        setFailed(!res.ok)
        setEvents(res.ok ? body.events ?? [] : [])
      })
      .catch(() => { if (alive) { setFailed(true); setEvents([]) } })
    return () => { alive = false }
  }, [laboratoryId, shelfId, limit, token])

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold">Zone history</h4>
      {failed ? (
        <p className="text-xs text-muted-foreground">Zone history unavailable</p>
      ) : events === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No zone changes yet</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {events.map((e, i) => {
            const line = zoneEventLine(e)
            return (
              <li key={`${e.changed_at}-${i}`}>
                <div className="text-muted-foreground">{line.when} · {line.who}</div>
                <div>{line.what}</div>
              </li>
            )
          })}
        </ul>
      )}
      {!failed && events !== null && events.length >= limit && limit < MAX_EVENTS && (
        <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(l + pageSize, MAX_EVENTS))}>
          Show more
        </Button>
      )}
    </section>
  )
}
