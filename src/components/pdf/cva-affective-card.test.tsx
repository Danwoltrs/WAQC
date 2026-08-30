// @vitest-environment node
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStream } from '@react-pdf/renderer'
import { ThermalCuppingCardA4Document } from './thermal-cupping-card-a4'
import { ThermalCuppingCardDocument, type ThermalCuppingCardData } from './thermal-cupping-card'
import { AFFECTIVE_ATTRIBUTES } from './cva-affective-card'

/** 1x1 transparent PNG — an Image slot needs a real source. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function card(n: number, is_cva: boolean, qr = true): ThermalCuppingCardData {
  return {
    sample_id: `s${n}`,
    sample_number: `SAN-0000${n}/26`,
    tracking_number: `SAN-0000${n}/26`,
    sample_type: 'pss',
    wolthers_contract_nr: `4500${n}/26`,
    print_date: '30 AUG 2026',
    exporter_sample_number: `EXP-${n}`,
    quality_name: 'Specialty 86+',
    buyer_name: 'Blaser Trading',
    exporter_name: 'Cocatrel',
    lab_name: 'Santos',
    template_id: 'tpl-1',
    template_name: 'CVA',
    template_scale_info: '1-9',
    attributes: ['Frag', 'Arom', 'Body'],
    num_cuppers: 3,
    cuppers: ['Anderson', 'Bia', 'Maria'],
    qr_code: qr ? PIXEL : '',
    is_cva,
    cupper_name: is_cva ? 'Anderson Silva' : undefined,
    cupper_key: is_cva ? 'u1' : undefined,
  }
}

async function render(doc: React.ReactElement<any>): Promise<string> {
  const stream = await renderToStream(doc)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('latin1')
}

/** Count page objects ("/Type /Page" but not "/Type /Pages"). */
function pageCount(pdf: string): number {
  return (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length
}

const common = { show_quality: true, show_buyer: true, show_supplier: true, show_exporter: true }

describe('specialty Affective cards inside the commodity documents', () => {
  it('lists the eight SCA-104 attributes in form order', () => {
    expect(AFFECTIVE_ATTRIBUTES).toEqual([
      'Fragrance', 'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall',
    ])
  })

  it('A4: eight mixed cards fill one sheet, nine spill to a second', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => card(i + 1, i % 2 === 0))
    expect(pageCount(await render(<ThermalCuppingCardA4Document cards={eight} {...common} />))).toBe(1)
    expect(
      pageCount(await render(<ThermalCuppingCardA4Document cards={[...eight, card(9, true)]} {...common} />)),
    ).toBe(2)
  })

  it('A6 thermal: one page per card, specialty or not', async () => {
    const cards = [card(1, true), card(2, false), card(3, true)]
    expect(pageCount(await render(<ThermalCuppingCardDocument cards={cards} {...common} />))).toBe(3)
  })

  it('renders a specialty card with no QR and no cupper name', async () => {
    const blank = { ...card(1, true, false), cupper_name: undefined }
    expect(pageCount(await render(<ThermalCuppingCardA4Document cards={[blank]} {...common} />))).toBe(1)
  })
})
