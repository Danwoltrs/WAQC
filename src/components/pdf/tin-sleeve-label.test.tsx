// @vitest-environment node
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStream } from '@react-pdf/renderer'
import { TinSleeveLabelDocument, type TinSleeveLabelData } from './tin-sleeve-label'

/** 1x1 transparent PNG — the logo slot has to be a real image source. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function label(n: number, size: '4cm' | '2.5cm'): TinSleeveLabelData {
  return {
    headline: `BR-0369${String(n).padStart(2, '0')}/JUL/26`,
    references: [{ label: 'Container: ', value: `HASU 155.20${n}-6` }],
    seller: 'Cocatrel (34680)',
    client: 'Blaser (198342)',
    cert: null,
    roaster: null,
    quality: 'DDQ',
    quantity: '333 bags in 60 kg jute bags | 20.0 MT',
    date: '29/Jul/2026',
    logo_url: PIXEL,
    size,
  }
}

async function render(labels: TinSleeveLabelData[]): Promise<string> {
  const stream = await renderToStream(<TinSleeveLabelDocument labels={labels} />)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.from(chunk))
  }
  // latin1 keeps byte offsets intact for the structural regex below.
  return Buffer.concat(chunks).toString('latin1')
}

/** Count page objects in the PDF body ("/Type /Page" but not "/Type /Pages"). */
function pageCount(pdf: string): number {
  return (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length
}

describe('TinSleeveLabelDocument pagination', () => {
  it('keeps five 4cm labels on one sheet', async () => {
    const pdf = await render([1, 2, 3, 4, 5].map(n => label(n, '4cm')))
    expect(pageCount(pdf)).toBe(1)
  })

  it('moves the sixth 4cm label onto a second sheet instead of slicing it', async () => {
    // Six labels used to render as five plus a decapitated sixth: 5 x 40mm
    // fills 200mm of the 210mm sheet, and the overflow was cut at the break.
    const pdf = await render([1, 2, 3, 4, 5, 6].map(n => label(n, '4cm')))
    expect(pageCount(pdf)).toBe(2)
  })

  it('cuts 4cm sheets every five labels', async () => {
    const pdf = await render(Array.from({ length: 11 }, (_, i) => label(i + 1, '4cm')))
    expect(pageCount(pdf)).toBe(3)
  })

  it('fits eight compact labels per sheet', async () => {
    const eight = await render(Array.from({ length: 8 }, (_, i) => label(i + 1, '2.5cm')))
    expect(pageCount(eight)).toBe(1)

    const nine = await render(Array.from({ length: 9 }, (_, i) => label(i + 1, '2.5cm')))
    expect(pageCount(nine)).toBe(2)
  })
}, 60_000)
