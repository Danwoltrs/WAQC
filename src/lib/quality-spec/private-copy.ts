import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Every client quality reads its own private copy of a template
 * (is_client_variant = true, migration 20261111000000), so a client's spec
 * change never reaches another client and a base template edit never reaches
 * any. Every client-quality create and every template_id change goes through
 * makePrivateCopy.
 */

export interface PrivateCopyEdits {
  /** The copy's name (name, name_en/pt/es); default: the source's names. */
  name?: string
  /** Edited parameters; default: the source's. */
  parameters?: Record<string, unknown>
  /** Edited description (description, description_en/pt/es). */
  description?: string
  methodology?: 'cva' | 'commodity'
  cva_min_score?: number | null
  requires_descriptors?: boolean
  /** The staff user making the copy (created_by of the copy and its v1 row). */
  createdBy?: string | null
  /**
   * The client quality the copy is for. Its own use of the source does not
   * make the source someone else's (a PATCH to the template it already has).
   */
  forClientQualityId?: string
}

/** A create whose first version could not be recorded was undone; the user tries again. */
export const QUALITY_NOT_CREATED = 'Could not create the quality, please try again.'

/** Columns never carried over to a copy. */
const NOT_COPIED = new Set(['id', 'created_at', 'updated_at'])

/**
 * A private copy of `sourceTemplateId` for one client quality: every column of
 * the source (as the 20261111000000 migration copied them), then
 * is_client_variant true, is_global false, template_parent_id = the source,
 * version 1, active, plus a template_versions v1 row.
 *
 * A source that is already a client copy no other client quality uses is
 * reused as it is (`created: false`), with no edits applied: copying it again
 * would only leave the old one orphaned.
 *
 * Throws when the source cannot be read or the copy cannot be inserted. The
 * v1 row is best-effort, as it always was. `db` is the caller's client (RLS
 * applies) or the service role.
 */
export async function makePrivateCopy(
  db: SupabaseClient<any>,
  sourceTemplateId: string,
  edits: PrivateCopyEdits = {},
): Promise<{ templateId: string; created: boolean }> {
  const { data: source, error: sourceError } = await db
    .from('quality_templates')
    .select('*')
    .eq('id', sourceTemplateId)
    .single()
  if (sourceError || !source) {
    throw new Error(`Template ${sourceTemplateId} not found${sourceError?.message ? `: ${sourceError.message}` : ''}`)
  }
  const tpl = source as Record<string, any>

  if (tpl.is_client_variant) {
    const { data: users, error: usersError } = await db
      .from('client_qualities')
      .select('id')
      .eq('template_id', sourceTemplateId)
    if (usersError) throw usersError
    const others = ((users ?? []) as Array<{ id: string }>).filter((u) => u.id !== edits.forClientQualityId)
    if (others.length === 0) return { templateId: sourceTemplateId, created: false }
  }

  const copy: Record<string, any> = {}
  for (const [k, v] of Object.entries(tpl)) if (!NOT_COPIED.has(k)) copy[k] = v

  const parameters = edits.parameters ?? tpl.parameters ?? {}
  Object.assign(copy, {
    template_parent_id: tpl.id,
    is_client_variant: true,
    is_global: false,
    version: 1,
    is_active: true,
    parameters,
    created_by: edits.createdBy ?? tpl.created_by ?? null,
  })
  if (edits.name) {
    Object.assign(copy, { name: edits.name, name_en: edits.name, name_pt: edits.name, name_es: edits.name })
  }
  if (typeof edits.description === 'string') {
    Object.assign(copy, {
      description: edits.description,
      description_en: edits.description,
      description_pt: edits.description,
      description_es: edits.description,
    })
  }
  if (typeof (parameters as Record<string, unknown>).sample_size_grams === 'number') {
    copy.sample_size_grams = (parameters as Record<string, unknown>).sample_size_grams
  }
  if (edits.methodology) copy.methodology = edits.methodology
  if (edits.cva_min_score !== undefined) copy.cva_min_score = edits.cva_min_score
  if (edits.requires_descriptors !== undefined) copy.requires_descriptors = !!edits.requires_descriptors

  const { data: inserted, error: insertError } = await db
    .from('quality_templates')
    .insert(copy)
    .select()
    .single()
  if (insertError || !inserted) {
    throw new Error(`Could not copy template ${sourceTemplateId}${insertError?.message ? `: ${insertError.message}` : ''}`)
  }
  const newId = (inserted as { id: string }).id

  await db.from('template_versions').insert({
    template_id: newId,
    version_number: 1,
    parameters: (inserted as Record<string, unknown>).parameters ?? parameters,
    changes_description: `Client variant cloned from: ${tpl.name_en || tpl.name}`,
    created_by: edits.createdBy ?? null,
  })

  return { templateId: newId, created: true }
}

/**
 * Undo a create: the new client quality row and, when one was made for it,
 * the private copy with its template_versions rows (the FK cascades too).
 * Best-effort; errors are logged.
 */
export async function removeCreatedQuality(
  db: SupabaseClient<any>,
  clientQualityId: string | null,
  copy: { templateId: string; created: boolean } | null,
): Promise<void> {
  try {
    if (clientQualityId) await db.from('client_qualities').delete().eq('id', clientQualityId)
    if (copy?.created) {
      await db.from('template_versions').delete().eq('template_id', copy.templateId)
      await db.from('quality_templates').delete().eq('id', copy.templateId)
    }
  } catch (err) {
    console.error('[private-copy] could not remove a half-created quality:', err)
  }
}
