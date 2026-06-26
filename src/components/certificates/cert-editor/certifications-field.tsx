'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, X, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { CERTIFICATIONS } from '@/components/samples/intake/constants'

/** Certifications editor: pull-from-sys-contract + canonical toggle chips + custom add/remove. */
export function CertificationsField({
  sampleId,
  value,
  onChange,
}: {
  sampleId: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { toast } = useToast()
  const [pulling, setPulling] = useState(false)
  const [custom, setCustom] = useState('')

  const selected = Array.isArray(value) ? value : []
  const toggle = (cert: string) =>
    onChange(selected.includes(cert) ? selected.filter((c) => c !== cert) : [...selected, cert])
  const remove = (cert: string) => onChange(selected.filter((c) => c !== cert))
  const addCustom = () => {
    const v = custom.trim()
    if (v && !selected.includes(v)) onChange([...selected, v])
    setCustom('')
  }

  const pull = async () => {
    setPulling(true)
    try {
      const res = await fetch(`/api/samples/${sampleId}/contract-certifications`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to pull')
      if (!data.matched) {
        toast({ title: 'No linked contract', description: 'No sys contract matched this sample’s Wolthers contract #.' })
      } else if (!data.certifications?.length) {
        toast({ title: 'No certifications', description: 'The linked contract has no certifications.' })
      } else {
        onChange(data.certifications)
        toast({ title: 'Pulled from contract', description: `${data.certifications.length} certification(s) loaded.` })
      }
    } catch (e) {
      toast({ title: 'Pull failed', description: e instanceof Error ? e.message : 'Could not pull certifications', variant: 'destructive' })
    } finally {
      setPulling(false)
    }
  }

  const customCerts = selected.filter((c) => !CERTIFICATIONS.includes(c))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">Certifications</label>
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={pull} disabled={pulling}>
          {pulling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Pull from contract
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CERTIFICATIONS.map((cert) => {
          const on = selected.includes(cert)
          return (
            <button
              type="button"
              key={cert}
              onClick={() => toggle(cert)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
            >
              {cert}
            </button>
          )
        })}
      </div>
      {customCerts.length ? (
        <div className="flex flex-wrap gap-1.5">
          {customCerts.map((cert) => (
            <span key={cert} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground">
              {cert}
              <button type="button" onClick={() => remove(cert)} aria-label={`Remove ${cert}`} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add custom certification"
          className="h-8"
        />
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={addCustom}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}
