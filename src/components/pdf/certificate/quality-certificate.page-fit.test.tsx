// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStream } from '@react-pdf/renderer'
import { QualityCertificate } from './quality-certificate'
import type { CertificateData } from '@/lib/certificate-data'
import { specialtyLot, fourGroups } from './__fixtures__/specialty-lot'

/**
 * The certificate must be ONE page — with the real Inter metrics.
 *
 * vitest.setup.ts serves Noto Sans for every Inter request so PDF renders work
 * offline, and Noto's metrics differ from Inter's, so a page count measured
 * under the shim says nothing about production. This file serves the vendored
 * Inter files (test/fonts/inter, OFL) for the same URLs, so what it measures is
 * what the lab prints.
 *
 * Prod 2026-09-17: a specialty (CVA) lot rendered onto a blank second page —
 * the last flow box overshot the page by a few points and react-pdf split it.
 */

const INTER_BY_URL_TAIL: Record<string, string> = {
  VuLyfMZg: 'Inter-400.ttf',
  VuGKYMZg: 'Inter-600.ttf',
  VuFuYMZg: 'Inter-700.ttf',
}

beforeAll(() => {
  const inner = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('fonts.gstatic.com')) {
      const tail = Object.keys(INTER_BY_URL_TAIL).find((t) => url.includes(t))
      if (tail) {
        const buf = readFileSync(join(process.cwd(), 'test/fonts/inter', INTER_BY_URL_TAIL[tail]))
        // A Node Buffer handed to Response yields a subset no viewer can parse.
        return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {
          status: 200,
          headers: { 'Content-Type': 'font/ttf' },
        })
      }
    }
    return inner(input, init)
  }) as typeof fetch
})

async function render(data: CertificateData): Promise<string> {
  const stream = await renderToStream(React.createElement(QualityCertificate, { data }) as any)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('latin1')
}

/** Count page objects in the PDF body ("/Type /Page" but not "/Type /Pages"). */
function pageCount(pdf: string): number {
  return (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length
}

describe('specialty (CVA) certificate fits one page with the real Inter metrics', () => {
  it('the reported lot: no comments', async () => {
    expect(pageCount(await render(specialtyLot()))).toBe(1)
  }, 60_000)

  it('with grading and cupping comments', async () => {
    expect(pageCount(await render(specialtyLot({
      cuppingComments: 'Clean, sweet cup with a chocolate finish. Balanced acidity; body holds through the cool-down.',
      gradingComments: 'Slightly uneven bean size; a few broken beans in the pan fraction.',
    })))).toBe(1)
  }, 60_000)

  it('with every flavour-wheel group filled and a long descriptor list', async () => {
    const lot = specialtyLot()
    lot.cuppingData!.cvaDescriptors = fourGroups
    expect(pageCount(await render(lot))).toBe(1)
  }, 60_000)

  it('with the long descriptor list AND comments', async () => {
    const lot = specialtyLot({
      cuppingComments: 'Clean, sweet cup with a chocolate finish. Balanced acidity; body holds through the cool-down.',
      gradingComments: 'Slightly uneven bean size; a few broken beans in the pan fraction.',
    })
    lot.cuppingData!.cvaDescriptors = fourGroups
    expect(pageCount(await render(lot))).toBe(1)
  }, 60_000)
})

describe('commodity certificate still fits one page with the real Inter metrics', () => {
  it('a dense commodity lot with ten attributes, taints and faults', async () => {
    const lot = specialtyLot({
      cuppingComments: 'Standard Santos profile, slightly harsh on the finish.',
      gradingComments: null,
      qualitySpec: { name: 'NY 2/3 17/18 FC', template_name: 'Commodity', description: null, is_specialty: false, has_validation: true },
    })
    lot.cuppingData = {
      attributes: ['Fragrance', 'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Uniformity', 'Clean Cup', 'Sweetness']
        .map((n) => ({ name: n, score: 7, allowedMin: 6, allowedMax: 8, scaleMin: 1, scaleMax: 10 })),
      overallScore: 78.5, comments: null, isSpecialty: false, taints: 1, faults: 0,
      taintDetails: [{ name: 'Rioy', intensity: 1, cups_affected: 1 }], faultDetails: [],
      cleanCup: true, uniformCup: true, flavorDescriptor: 'Soft', cvaVerdict: null, cvaDescriptors: null,
    }
    expect(pageCount(await render(lot))).toBe(1)
  }, 60_000)
})
