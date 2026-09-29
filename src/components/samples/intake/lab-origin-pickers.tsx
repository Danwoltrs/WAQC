'use client'

import { useEffect, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ORIGINS } from './constants'
import type { FormData, Laboratory } from './types'

/**
 * The origins a sample can take at its lab: the selected lab's (or the only
 * lab's) supported origins; every origin when the lab lists none; none while
 * several labs are offered and none is picked.
 */
function supportedOriginsFor(laboratoryId: string, laboratories: Laboratory[]): string[] {
  const lab = laboratoryId
    ? laboratories.find((l) => l.id === laboratoryId)
    : laboratories.length === 1 ? laboratories[0] : undefined
  if (!lab || !lab.supported_origins || lab.supported_origins.length === 0) {
    return laboratories.length > 1 ? [] : ORIGINS
  }
  return ORIGINS.filter((origin) => lab.supported_origins!.includes(origin))
}

/**
 * The sample's lab and origin, in the wizard's footer (Daniel 2026-09-29):
 * most users have one lab with one origin, so both fill themselves and
 * nothing shows. The pickers appear only when there is a choice to make, or
 * when a value is still missing, so a required field is never hidden. The
 * `data-field` markers are what "Still needed" jumps to.
 */
export function LabOriginPickers({
  formData,
  updateFormData,
  laboratories,
}: {
  formData: FormData
  updateFormData: (field: keyof FormData, value: any) => void
  laboratories: Laboratory[]
}) {
  const supportedOrigins = useMemo(
    () => supportedOriginsFor(formData.laboratory_id, laboratories),
    [formData.laboratory_id, laboratories],
  )

  // The only lab is the sample's lab.
  useEffect(() => {
    if (laboratories.length === 1 && !formData.laboratory_id) {
      updateFormData('laboratory_id', laboratories[0].id)
    }
  }, [laboratories, formData.laboratory_id, updateFormData])

  // The only origin is the sample's origin; one the lab does not take is dropped.
  useEffect(() => {
    if (supportedOrigins.length === 1 && formData.origin !== supportedOrigins[0]) {
      updateFormData('origin', supportedOrigins[0])
    }
    if (formData.origin && supportedOrigins.length > 0 && !supportedOrigins.includes(formData.origin)) {
      updateFormData('origin', supportedOrigins.length === 1 ? supportedOrigins[0] : '')
    }
  }, [supportedOrigins, formData.origin, updateFormData])

  const showLab = laboratories.length > 1
  const showOrigin = supportedOrigins.length > 1 || (!formData.origin && !!formData.laboratory_id)
  if (!showLab && !showOrigin) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLab && (
        <div data-field="laboratory">
          <Select value={formData.laboratory_id} onValueChange={(value) => updateFormData('laboratory_id', value)}>
            <SelectTrigger aria-label="Laboratory" className="h-7 w-auto max-w-[14rem] gap-1.5 text-xs text-foreground">
              <SelectValue placeholder="Laboratory *" />
            </SelectTrigger>
            <SelectContent>
              {laboratories.map((lab) => (
                <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {showOrigin && (
        <div data-field="origin">
          <Select
            value={formData.origin}
            onValueChange={(value) => updateFormData('origin', value)}
            disabled={supportedOrigins.length === 0}
          >
            <SelectTrigger aria-label="Origin" className="h-7 w-auto max-w-[12rem] gap-1.5 text-xs text-foreground">
              <SelectValue placeholder={supportedOrigins.length === 0 ? 'Pick the lab first' : 'Origin *'} />
            </SelectTrigger>
            <SelectContent>
              {supportedOrigins.map((origin) => (
                <SelectItem key={origin} value={origin}>{origin}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
