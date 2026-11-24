'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  cleanNextNumber,
  cleanOriginCode,
  cleanOriginName,
  nextOriginCertificateNumber,
  type OriginNumberLine,
} from '@/lib/origin-certificate-numbers'

/**
 * Certificate numbers by origin: one line per origin, shared by every
 * laboratory and client. A global admin sets each origin's code and the number
 * its next certificate gets (so a line continues an older numbering). Everyone
 * else sees the lines without the controls.
 */

interface Draft { code: string; next: string }

export function OriginNumberingCard() {
  const [lines, setLines] = useState<OriginNumberLine[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [available, setAvailable] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState({ origin: '', code: '' })

  const take = (list: OriginNumberLine[]) => {
    setLines(list)
    setDrafts(Object.fromEntries(list.map((l) => [l.origin, { code: l.code, next: String(l.next_number) }])))
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/certificate-origin-lines')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load the numbering')
      setAvailable(data.available !== false)
      setCanEdit(data.can_edit === true)
      take(data.lines ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the numbering')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const send = async (method: 'PATCH' | 'POST', body: Record<string, unknown>, key: string): Promise<boolean> => {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/certificate-origin-lines', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.line) {
        setError(data.error || 'Could not save')
        return false
      }
      const saved = data.line as OriginNumberLine
      take([...lines.filter((l) => l.origin !== saved.origin), saved].sort((a, b) => a.origin.localeCompare(b.origin)))
      return true
    } finally {
      setBusy(null)
    }
  }

  if (loading) return null
  // Lab users who cannot change it are not shown an empty box.
  if (!available && !canEdit) return null

  const newOrigin = cleanOriginName(adding.origin)
  const newCode = cleanOriginCode(adding.code)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate numbers by origin</CardTitle>
        <p className="text-sm text-muted-foreground">
          One number line per origin, shared by every laboratory and client. An origin without a line (Brazil)
          keeps each client&apos;s own numbering.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!available && (
          <p className="text-sm text-muted-foreground">The numbering by origin is not set up on the database yet.</p>
        )}
        {error && <p role="alert" className="text-sm text-[#ef4444]">{error}</p>}

        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Origin</th>
                  <th className="px-2 py-2 font-medium">Code</th>
                  <th className="px-2 py-2 font-medium">Next number</th>
                  <th className="px-2 py-2 font-medium">Restarts each January</th>
                  <th className="px-2 py-2 font-medium">Next certificate</th>
                  <th className="px-2 py-2 font-medium">In use</th>
                  {canEdit && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const draft = drafts[line.origin] ?? { code: line.code, next: String(line.next_number) }
                  const code = cleanOriginCode(draft.code)
                  const next = cleanNextNumber(draft.next)
                  const changed = code !== line.code || next !== line.next_number
                  const valid = code !== null && next !== null
                  const preview = valid
                    ? nextOriginCertificateNumber({
                        ...line,
                        code,
                        next_number: next,
                        // A number typed here is this year's.
                        counter_year: next !== line.next_number ? new Date().getFullYear() : line.counter_year,
                      })
                    : '—'
                  return (
                    <tr key={line.origin} className="border-b">
                      <td className="px-2 py-2 font-medium">{line.origin}</td>
                      <td className="px-2 py-2">
                        {canEdit ? (
                          <Input
                            aria-label={`Code for ${line.origin}`}
                            value={draft.code}
                            maxLength={6}
                            onChange={(e) => setDrafts((d) => ({ ...d, [line.origin]: { ...draft, code: e.target.value.toUpperCase() } }))}
                            className="h-8 w-20"
                          />
                        ) : line.code}
                      </td>
                      <td className="px-2 py-2">
                        {canEdit ? (
                          <Input
                            aria-label={`Next number for ${line.origin}`}
                            type="number"
                            min={1}
                            value={draft.next}
                            onChange={(e) => setDrafts((d) => ({ ...d, [line.origin]: { ...draft, next: e.target.value } }))}
                            className="h-8 w-28"
                          />
                        ) : line.next_number}
                      </td>
                      <td className="px-2 py-2">
                        <Checkbox
                          aria-label={`${line.origin} restarts each January`}
                          checked={line.resets_yearly}
                          disabled={!canEdit || busy !== null}
                          onCheckedChange={(checked) => void send('PATCH', { origin: line.origin, resets_yearly: checked === true }, line.origin)}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{line.is_active ? preview : 'Client numbering'}</td>
                      <td className="px-2 py-2">
                        <Switch
                          aria-label={`Number ${line.origin} certificates on this line`}
                          checked={line.is_active}
                          disabled={!canEdit || busy !== null}
                          onCheckedChange={(checked) => void send('PATCH', { origin: line.origin, is_active: checked }, line.origin)}
                        />
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2 text-right">
                          <Button
                            size="sm"
                            disabled={!changed || !valid || busy !== null}
                            onClick={() => void send('PATCH', { origin: line.origin, code, next_number: next }, line.origin)}
                          >
                            {busy === line.origin ? 'Saving…' : 'Save'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && available && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <Input
              aria-label="New origin"
              placeholder="Origin, as on the sample"
              value={adding.origin}
              onChange={(e) => setAdding((a) => ({ ...a, origin: e.target.value }))}
              className="h-8 w-56"
            />
            <Input
              aria-label="Code for the new origin"
              placeholder="Code"
              maxLength={6}
              value={adding.code}
              onChange={(e) => setAdding((a) => ({ ...a, code: e.target.value.toUpperCase() }))}
              className="h-8 w-20"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!newOrigin || !newCode || busy !== null}
              onClick={async () => {
                if (await send('POST', { origin: newOrigin, code: newCode }, '__new__')) setAdding({ origin: '', code: '' })
              }}
            >
              Add origin
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
