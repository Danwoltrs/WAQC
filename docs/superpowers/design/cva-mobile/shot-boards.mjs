// Per-artboard captures at (near) native scale: a very large viewport makes the
// canvas' fit-zoom ≈ 1, then each artboard iframe is screenshotted as an element.
// Usage: node shot-boards.mjs <html> <prefix> [page-index]
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(process.env.PUPPETEER_PKG ?? '/Users/danielwolthers/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/package.json')
const puppeteer = require('puppeteer')

const [,, html, prefix] = process.argv
const outDir = '/private/tmp/claude-501/-Users-danielwolthers-Documents-GitHub-WAQC/449a465e-94a3-488f-b124-25d36a0f0468/scratchpad/design/shots'
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  userDataDir: '/private/tmp/claude-501/-Users-danielwolthers-Documents-GitHub-WAQC/449a465e-94a3-488f-b124-25d36a0f0468/scratchpad/design/chrome-profile',
  args: ['--no-first-run', '--allow-file-access-from-files'],
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 300)))
await page.setViewport({ width: 3600, height: 2400, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 })
await new Promise((r) => setTimeout(r, 7000))

const iframes = await page.$$('iframe')
console.log('iframes', iframes.length)
let i = 0
for (const el of iframes) {
  const box = await el.boundingBox()
  if (!box || box.width < 40) { i++; continue }
  await el.screenshot({ path: `${outDir}/${prefix}-board-${i}.png` })
  console.log('board', i, Math.round(box.width) + 'x' + Math.round(box.height))
  i++
}
if (errors.length) { console.log('--- console ---'); for (const e of errors.slice(0, 25)) console.log(e) }
await browser.close()
