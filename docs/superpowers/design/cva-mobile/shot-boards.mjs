// Per-artboard captures at (near) native scale: a very large viewport makes the
// canvas' fit-zoom ≈ 1, then each artboard iframe is screenshotted as an element.
// Usage: node shot-boards.mjs <html> <prefix> [page-index]
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(process.env.PUPPETEER_PKG ?? '/Users/danielwolthers/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/package.json')
const puppeteer = require('puppeteer')

const [,, html, prefix] = process.argv
// Relative to the scratch dir the script runs in — a session-scoped absolute
// path here goes stale the moment a new session rebuilds the canvas.
const outDir = 'shots'
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  userDataDir: 'chrome-profile',
  args: ['--no-first-run', '--allow-file-access-from-files'],
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 300)))
await page.setViewport({ width: 3600, height: 2400, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 })
await new Promise((r) => setTimeout(r, 12000))

// Name each shot after the artboard it holds, not its DOM index: the canvas
// mounts iframes lazily and out of order, so an index is not a stable identity.
// The frame's own <title> is what buildWheel/buildSection set, so it identifies
// the board even when the iframe is srcdoc/blob-backed and has no useful src.
const iframes = await page.$$('iframe')
console.log('iframes', iframes.length)
const shot = []
let i = 0
for (const el of iframes) {
  const withTimeout0 = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
  const box = await withTimeout0(el.boundingBox(), 4000)
  if (!box || box.width < 40) { console.log(String(i).padStart(2), '(iframe never mounted — skipped)'); i++; continue }
  // contentFrame()/title() can hang forever on a frame the canvas has not finished
  // mounting, which silently stalls the whole run — always race it.
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
  let name = null
  try {
    const f = await withTimeout(el.contentFrame(), 4000)
    if (f) name = (await withTimeout(f.title(), 4000)) || null
  } catch { /* cross-origin, detached, or not yet loaded */ }
  const slug = (name || 'board-' + i).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  // A board the canvas has not finished mounting can also hang the capture itself.
  const done = await withTimeout(el.screenshot({ path: `${outDir}/${prefix}-${slug}.png` }).then(() => true), 15000)
  if (!done) { console.log(String(i).padStart(2), slug.padEnd(34), 'TIMED OUT — not captured'); i++; continue }
  shot.push(slug)
  console.log(String(i).padStart(2), slug.padEnd(34), Math.round(box.width) + 'x' + Math.round(box.height))
  i++
}
console.log('captured', shot.length, 'boards')
