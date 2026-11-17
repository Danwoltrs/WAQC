import type { QualitySensorySettings } from './types'

const NOTES_KEY = 'sensory_notes_enabled'
const PROFILE_KEY = 'regional_profile'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Custom parameters win when they carry the key (even as false/null); otherwise the template's value. */
function pick(custom: Record<string, unknown>, template: Record<string, unknown>, key: string): unknown {
  return custom[key] !== undefined && Object.prototype.hasOwnProperty.call(custom, key) ? custom[key] : template[key]
}

export function readSensorySettings(
  customParameters: unknown,
  templateParameters: unknown,
  methodology?: string | null,
): QualitySensorySettings {
  if (methodology === 'cva') return { notesEnabled: false, profile: null }
  const custom = asRecord(customParameters)
  const template = asRecord(templateParameters)
  const notesEnabled = pick(custom, template, NOTES_KEY) === true
  const rp = asRecord(pick(custom, template, PROFILE_KEY))
  const profile =
    typeof rp.id === 'string' && rp.id !== '' && typeof rp.name === 'string'
      ? { id: rp.id, name: rp.name }
      : null
  return { notesEnabled, profile }
}

export function stripSensorySettings<T extends Record<string, unknown>>(parameters: T): T {
  const copy: Record<string, unknown> = { ...parameters }
  delete copy[NOTES_KEY]
  delete copy[PROFILE_KEY]
  return copy as T
}
