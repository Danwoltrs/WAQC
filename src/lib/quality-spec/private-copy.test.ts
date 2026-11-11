import { describe, it, expect, vi } from 'vitest'
import { seededDb } from './__fixtures__/seeded-db'
import { makePrivateCopy, removeCreatedQuality } from './private-copy'

function seed() {
  return {
    quality_templates: [
      {
        id: 'tpl-base', name: 'FC', name_en: 'FC', is_client_variant: false, is_global: true, template_parent_id: null,
        version: 7, is_active: true, parameters: { moisture_max: 12.5 }, moisture_standard: 12, cva_score_spread_max: 2,
        created_by: 'author', created_at: '2026-01-01', updated_at: '2026-02-01',
      },
      { id: 'tpl-copy-free', name: 'FC', is_client_variant: true, template_parent_id: 'tpl-base', version: 3, parameters: {} },
      { id: 'tpl-copy-used', name: 'FC', is_client_variant: true, template_parent_id: 'tpl-base', version: 3, parameters: {} },
    ],
    client_qualities: [
      { id: 'cq-own', template_id: 'tpl-copy-free' },
      { id: 'cq-other', template_id: 'tpl-copy-used' },
    ],
    template_versions: [],
  }
}

describe('makePrivateCopy', () => {
  it('copies a base template into a private client copy, version 1, with its v1 row', async () => {
    const db = seededDb(seed())
    const res = await makePrivateCopy(db as any, 'tpl-base', { createdBy: 'staff-1' })
    expect(res.created).toBe(true)
    expect(res.templateId).not.toBe('tpl-base')
    const copy = db.rows.quality_templates.find((t) => t.id === res.templateId)!
    expect(copy).toMatchObject({
      is_client_variant: true, is_global: false, template_parent_id: 'tpl-base', version: 1, is_active: true,
      parameters: { moisture_max: 12.5 }, moisture_standard: 12, cva_score_spread_max: 2, name: 'FC', created_by: 'staff-1',
    })
    expect(copy.created_at).toBeUndefined()
    expect(db.rows.template_versions).toEqual([
      expect.objectContaining({ template_id: res.templateId, version_number: 1, parameters: { moisture_max: 12.5 } }),
    ])
  })

  it('applies the edits to the copy only', async () => {
    const db = seededDb(seed())
    const res = await makePrivateCopy(db as any, 'tpl-base', {
      name: '15/16 FC', parameters: { moisture_max: 12, sample_size_grams: 350 }, description: 'Brazil 15/16',
    })
    const copy = db.rows.quality_templates.find((t) => t.id === res.templateId)!
    expect(copy).toMatchObject({
      name: '15/16 FC', name_en: '15/16 FC', name_pt: '15/16 FC', name_es: '15/16 FC',
      description_en: 'Brazil 15/16', parameters: { moisture_max: 12, sample_size_grams: 350 }, sample_size_grams: 350,
    })
    expect(db.rows.quality_templates.find((t) => t.id === 'tpl-base')!.parameters).toEqual({ moisture_max: 12.5 })
  })

  it('reuses a client copy nobody else uses', async () => {
    const db = seededDb({ ...seed(), client_qualities: [] })
    expect(await makePrivateCopy(db as any, 'tpl-copy-free')).toEqual({ templateId: 'tpl-copy-free', created: false })
    expect(db.writes).toEqual([])
  })

  it('reuses a client copy only the quality it is for already uses', async () => {
    const db = seededDb(seed())
    const res = await makePrivateCopy(db as any, 'tpl-copy-free', { forClientQualityId: 'cq-own' })
    expect(res).toEqual({ templateId: 'tpl-copy-free', created: false })
  })

  it('copies a client copy another client quality uses', async () => {
    const db = seededDb(seed())
    const res = await makePrivateCopy(db as any, 'tpl-copy-used', { forClientQualityId: 'cq-new' })
    expect(res.created).toBe(true)
    expect(db.rows.quality_templates.find((t) => t.id === res.templateId)).toMatchObject({
      template_parent_id: 'tpl-copy-used', is_client_variant: true, version: 1,
    })
  })

  it('throws for an unknown template', async () => {
    await expect(makePrivateCopy(seededDb(seed()) as any, 'tpl-gone')).rejects.toThrow(/not found/)
  })

  it('throws when the copy cannot be inserted', async () => {
    const db = seededDb(seed(), { fail: (t, op) => (t === 'quality_templates' && op === 'insert' ? { message: 'denied' } : null) })
    await expect(makePrivateCopy(db as any, 'tpl-base')).rejects.toThrow(/denied/)
  })
})

describe('removeCreatedQuality', () => {
  it('removes the new quality, the copy made for it and its version rows', async () => {
    const db = seededDb(seed())
    const copy = await makePrivateCopy(db as any, 'tpl-base')
    db.rows.client_qualities.push({ id: 'cq-new', template_id: copy.templateId })
    await removeCreatedQuality(db as any, 'cq-new', copy)
    expect(db.rows.client_qualities.map((r) => r.id)).toEqual(['cq-own', 'cq-other'])
    expect(db.rows.quality_templates.some((t) => t.id === copy.templateId)).toBe(false)
    expect(db.rows.template_versions).toEqual([])
  })

  it('leaves a reused template alone', async () => {
    const db = seededDb(seed())
    await removeCreatedQuality(db as any, 'cq-own', { templateId: 'tpl-copy-free', created: false })
    expect(db.rows.quality_templates.some((t) => t.id === 'tpl-copy-free')).toBe(true)
    expect(db.rows.client_qualities.map((r) => r.id)).toEqual(['cq-other'])
  })

  it('logs instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { from: () => { throw new Error('down') } }
    await expect(removeCreatedQuality(db as any, 'cq-x', null)).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
