// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStream } from '@react-pdf/renderer'
import { PerformanceReport } from './performance-report'
import { dunkinWeek } from './__fixtures__/dunkin-week'

/**
 * Page layout of the weekly report, measured with the real Inter metrics
 * (vitest.setup.ts otherwise serves Noto Sans, whose widths differ). See
 * quality-certificate.page-fit.test.tsx for the font shim.
 *
 * Set REPORT_PDF_OUT=/path/file.pdf to keep the rendered PDF for a look.
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
        return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {
          status: 200,
          headers: { 'Content-Type': 'font/ttf' },
        })
      }
    }
    return inner(input, init)
  }) as typeof fetch
})

async function render(el: React.ReactElement): Promise<Buffer> {
  const stream = await renderToStream(el as any)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length

describe('weekly report page layout (Dunkin, 21–25/09/2026)', () => {
  it('keeps the flow on the certificates page instead of a page of its own', async () => {
    const pdf = await render(React.createElement(PerformanceReport, { data: dunkinWeek() }))
    if (process.env.REPORT_PDF_OUT) writeFileSync(process.env.REPORT_PDF_OUT, pdf)
    // PSS: charts page (with its flow) + certificates page.
    // SS: charts page, certificates page (region tables + flow), then the
    // supplier rating and the 40-row table on the next two. The 29/09 report
    // printed the SS flow alone on a page, leaving the one before it blank.
    expect(pageCount(pdf)).toBe(6)
  }, 30_000)
})
