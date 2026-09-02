// Phase-0 trace driver for the CVA flavour wheel harness.
// usage: node trace-wheel.mjs --scenario hover|drill|mobile --out trace.json [--url URL] [--headless]
import { createRequire } from 'node:module'
const require = createRequire('/Users/danielwolthers/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/package.json')
const puppeteer = require('puppeteer')

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean))
const scenario = args.scenario || 'hover'
const url = args.url || 'http://localhost:3000/embed/wheel-harness'
const out = args.out || `trace-${scenario}.json`
const headless = args.headless === true || args.headless === 'true'

const VIEW = 440, CX = 220, CY = 220, R0 = 58, R1 = 106, R2 = 158, R3 = 212
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  headless,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=2600,1500', '--force-device-scale-factor=2'],
  defaultViewport: null,
})
const page = await browser.newPage()
const mobile = scenario === 'mobile'
if (mobile) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36')
} else {
  await page.setViewport({ width: +(args.vw || 2560), height: +(args.vh || 1400), deviceScaleFactor: 2 })
}
const cdp = await page.createCDPSession()
if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForSelector('.wheel-scene', { timeout: 120000 })
await sleep(1500)

// viewBox → screen, reading the CURRENT (transformed) svg box
async function mapper() {
  const r = await page.evaluate(() => {
    const b = document.querySelector('.wheel-scene').getBoundingClientRect()
    return { left: b.left, top: b.top, width: b.width, height: b.height }
  })
  return (x, y) => [r.left + (x * r.width) / VIEW, r.top + (y * r.height) / VIEW]
}
async function nodeInfo() {
  // family spans + Other Fruit leaves, from the aria labels + geometry we know
  return page.evaluate(() => {
    const out = []
    document.querySelectorAll('g[role=button]').forEach((g) => out.push(g.getAttribute('aria-label')))
    return out
  })
}
const polar = (a, r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]

// Family angular spans in the wheel's leaf-count layout (110 leaves total).
const FAMS = [['Floral', 4], ['Fruity', 18], ['Sour/Fermented', 10], ['Green/Vegetative', 10], ['Other', 16], ['Roasted', 8], ['Spices', 6], ['Nutty/Cocoa', 5], ['Sweet', 8]]
// leaf counts above come from flavor-wheel-data (Floral: BlackTea1 + 3; Fruity: 4+2+8+4; Sour: 6+4; Green: 1+1+7+1; Other: 10+6; Roasted: 1+1+4+2; Spices: 1+1+4; Nutty: 3+2; Sweet: 4+1+1+1+1)
const TOTAL = FAMS.reduce((s, [, n]) => s + n, 0)
const U = (Math.PI * 2) / TOTAL
const spans = {}
let a = -Math.PI / 2
for (const [n, c] of FAMS) { spans[n] = [a, a + c * U]; a += c * U }
if (TOTAL !== 85) throw new Error('leaf total mismatch ' + TOTAL)

const marks = []
const mark = async (name) => { marks.push({ name, t: Date.now() }); await page.evaluate((n) => performance.mark(n), name) }

await page.tracing.start({
  path: out,
  categories: [
    'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack', 'benchmark', 'toplevel', 'blink.user_timing', 'loading', 'v8.execute',
  ],
})
await sleep(300)

if (scenario === 'hover') {
  // (a) hover across families at the family ring, dwelling long enough for the dwell-zoom
  let M = await mapper()
  await mark('hover-start')
  for (const [n] of FAMS) {
    const [a0, a1] = spans[n]
    M = await mapper()
    const [x, y] = M(...polar((a0 + a1) / 2, (R0 + R1) / 2))
    await page.mouse.move(x, y, { steps: 18 })
    await sleep(380)
  }
  // leave the wheel → springs to rest
  await page.mouse.move(40, 40, { steps: 10 })
  await sleep(700)
  await mark('hover-end')
} else if (scenario === 'drill') {
  // (b) center → Fruity → Other Fruit leaves
  let M = await mapper()
  await mark('drill-start')
  await page.mouse.move(...M(CX, CY), { steps: 8 })
  await sleep(400)
  const [f0, f1] = spans['Fruity']
  await page.mouse.click(...M(...polar((f0 + f1) / 2, (R0 + R1) / 2)))
  await sleep(900) // dwell-in (210ms) + grand zoom (550ms)
  M = await mapper()
  // Other Fruit = leaves 7..14 of Fruity (Berry 4, Dried 2, Other 8, Citrus 4)
  const o0 = f0 + 6 * U, o1 = f0 + 14 * U
  await page.mouse.move(...M(...polar(o0 + U / 2, R1 + 20)), { steps: 12 })
  await sleep(300)
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(...M(...polar(o0 + (i + 0.5) * U, (R2 + R3) / 2)), { steps: 10 })
    await sleep(140)
  }
  for (let i = 7; i >= 0; i--) {
    await page.mouse.move(...M(...polar(o0 + (i + 0.5) * U, (R2 + R3) / 2)), { steps: 10 })
    await sleep(140)
  }
  await page.mouse.move(...M(CX, CY), { steps: 12 })
  await sleep(900)
  await mark('drill-end')
} else if (scenario === 'mobile') {
  let M = await mapper()
  await mark('mobile-start')
  const [f0, f1] = spans['Fruity']
  await page.touchscreen.tap(...M(...polar((f0 + f1) / 2, (R0 + R1) / 2)))
  await sleep(1100)
  M = await mapper()
  const o0 = f0 + 6 * U
  await page.touchscreen.tap(...M(...polar(o0 + 2.5 * U, (R2 + R3) / 2)))
  await sleep(700)
  await page.touchscreen.tap(...M(...polar(o0 + 4.5 * U, (R2 + R3) / 2)))
  await sleep(700)
  // switch family by tap
  const [s0, s1] = spans['Sweet']
  await page.touchscreen.tap(...M(...polar((s0 + s1) / 2, (R0 + R1) / 2)))
  await sleep(1100)
  M = await mapper()
  await page.touchscreen.tap(...M(CX, CY - 10)) // hub → rest (svg click)
  await sleep(1000)
  await mark('mobile-end')
}

await sleep(300)
await page.tracing.stop()
const domCount = await page.evaluate(() => ({
  svgNodes: document.querySelectorAll('.wheel-scene *').length,
  texts: document.querySelectorAll('.wheel-scene text').length,
  paths: document.querySelectorAll('.wheel-scene path').length,
  filters: document.querySelectorAll('.wheel-scene [filter], .wheel-scene filter').length,
  dpr: devicePixelRatio,
  stage: (() => { const b = document.querySelector('.wheel-root').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] })(),
}))
console.log(JSON.stringify({ scenario, out, marks, domCount }, null, 2))
await browser.close()
