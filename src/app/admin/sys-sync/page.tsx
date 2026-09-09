'use client'

import { useCallback, useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface IssueRow {
  id: string
  sample_id: string | null
  contract_id: string | null
  waqc_ref: string | null
  stage: 'mirror' | 'decision' | 'email'
  reason: string
  detail: Record<string, unknown> | null
  created_at: string
  tracking_number: string | null
  wolthers_contract_nr: string | null
}

/**
 * Open QC→sys mirror issues. Each row is a sample sys could not mirror on its
 * own (unresolved contract number, ambiguous placeholder, trigger error, or a
 * skipped decision write-back). Fix the cause on the sample (usually the
 * contract number), then Resolve.
 */
export default function SysSyncPage() {
  const [rows, setRows] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/sys-sync')
      const j = await r.json()
      setRows(j.issues ?? [])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const resolve = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/sys-sync/${id}/resolve`, { method: 'POST' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <MainLayout>
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sys sync issues {loading ? '' : `(${rows.length})`}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Samples sys.wolthers.com could not mirror by itself. Fix the cause on the sample, then resolve.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nothing to resolve.</TableCell></TableRow>
                ) : null}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-GB')}</TableCell>
                    <TableCell className="font-mono text-xs">{r.tracking_number ?? r.waqc_ref ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.wolthers_contract_nr ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{r.stage}</Badge></TableCell>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={r.detail ? JSON.stringify(r.detail, null, 2) : ''}>
                      {r.detail ? JSON.stringify(r.detail) : ''}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void resolve(r.id)}>
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
