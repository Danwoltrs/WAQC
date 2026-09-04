// Drives the section screen's two tracks and the cups step with pointer events
// dispatched INSIDE the artboard frame (frame-local coordinates — the canvas
// zooms artboards, so page-level mouse coordinates land in the wrong segment),
// and reads back what the page shows.
// Note: frame.evaluate below is Puppeteer's browser-side function call against a
// page we built ourselves in this session — no string eval.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(process.env.PUPPETEER_PKG ?? '/Users/danielwolthers/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/package.json')
const puppeteer = require('puppeteer')

const [,, html] = process.argv
// Relative to the scratch dir the script runs in — see shot-boards.mjs.
const outDir = 'shots'
await (await import('node:fs')).promises.mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({ headless: true, userDataDir: outDir + '/../chrome-profile', args: ['--no-first-run', '--allow-file-access-from-files'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 3600, height: 2400, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 })
await new Promise((r) => setTimeout(r, 7000))

const frames = page.frames().filter((f) => f !== page.mainFrame())
const findFrame = async (needle) => { for (const f of frames) { const t = await f.evaluate(() => document.body.innerText).catch(() => ''); if (t.includes(needle)) return f } return null }
// Each artboard sets its own <title>, which is the only stable way to tell the
// five wheel frames apart — their body text is nearly identical.
const byTitle = async (needle) => { for (const f of frames) { const t = await f.title().catch(() => ''); if (t.includes(needle)) return f } return null }
// Family names as the wheel actually renders them (upper case, split at the slash).
const FAMS = ['FLORAL', 'FRUITY', 'SOUR/FERMENTED', 'GREEN/VEGETATIVE', 'OTHER', 'ROASTED', 'SPICES', 'NUTTY/COCOA', 'SWEET']
// Text of every label the wheel is currently SHOWING (display:none ones excluded).
const shownLabels = (f) => f.evaluate(() => [...document.querySelectorAll('svg text')]
  .filter((t) => getComputedStyle(t).display !== 'none' && t.getClientRects().length)
  .map((t) => t.textContent.replace(/\s+/g, ' ').trim()))
const ok = (label, cond, got) => console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (cond ? '' : '   got: ' + JSON.stringify(got)))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// In-frame helpers: pointer sequence on the Nth .track at a fraction of its width; click a button by text.
const pointer = (f, trackIdx, fracs) => f.evaluate((idx, fr) => {
  const el = document.querySelectorAll('.track')[idx]
  const r = el.getBoundingClientRect()
  const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width * x, clientY: r.top + r.height * 0.7 }))
  ev('pointerdown', fr[0])
  for (const x of fr.slice(1)) ev('pointermove', x)
  ev('pointerup', fr[fr.length - 1])
}, trackIdx, fracs)
const clickText = (f, needle, exact = false) => f.evaluate((n, ex) => { const b = [...document.querySelectorAll('button')].find((b) => ex ? b.innerText.trim() === n : b.innerText.includes(n)); if (!b) return false; b.click(); return true }, needle, exact)
const body = (f) => f.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const readout = (f) => f.evaluate(() => { const s = [...document.querySelectorAll('span')].find((x) => /^\d · (Extremely|Very|Moderately|Slightly|Neither)/.test(x.innerText.trim()) || x.innerText.trim() === 'Tap or drag to rate'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : null })

// ---- Section (Aftertaste) ----
const sec = await findFrame('AFFECTIVE IMPRESSION')
if (!sec) { console.log('FAIL section frame not found'); await browser.close(); process.exit(1) }
ok('initial readout is 6 · Slightly High', (await readout(sec)) === '6 · Slightly High', await readout(sec))

await pointer(sec, 0, [7.5 / 9]); await wait(250)
ok('tap on segment 8 → 8 · Very High', (await readout(sec)) === '8 · Very High', await readout(sec))

await pointer(sec, 0, [7.5 / 9, 6.5 / 9, 5.5 / 9, 4.5 / 9, 3.5 / 9, 2.5 / 9]); await wait(250)
ok('drag 8 → 3 → 3 · Moderately Low', (await readout(sec)) === '3 · Moderately Low', await readout(sec))

ok('Cooled button found + clicked', await clickText(sec, 'Cooled'), null); await wait(200)
await pointer(sec, 0, [4.5 / 9]); await wait(250)
const b1 = await body(sec)
ok('cooled second mark → "3 → 5 · rose as it cooled · Final 5"', b1.includes('3 → 5 · rose as it cooled · Final 5'), b1.slice(0, 260))
ok('readout shows the FINAL (5 · Neither High nor Low)', (await readout(sec)) === '5 · Neither High nor Low', await readout(sec))

// intensity: the rail spans 14px..width-14px; frac = (14 + (w-28)*v/15)/w — dispatch at v=9
const intFrac = await sec.evaluate(() => { const el = document.querySelectorAll('.track')[1]; const w = el.getBoundingClientRect().width; return (14 + (w - 28) * (9 / 15)) / w })
await pointer(sec, 1, [intFrac]); await wait(250)
const intVal = await sec.$eval('input[aria-label="Intensity value"]', (el) => el.value)
ok('intensity tap at 9/15 → field shows 9', intVal === '9', intVal)
const b2 = await body(sec)
ok('intensity shift line "8 → 9" (cooled → final)', b2.includes('8 → 9'), b2.slice(0, 260))

// drag the intensity thumb down to 2
const f2 = await sec.evaluate(() => { const el = document.querySelectorAll('.track')[1]; const w = el.getBoundingClientRect().width; return [9, 7, 5, 3, 2].map((v) => (14 + (w - 28) * (v / 15)) / w) })
await pointer(sec, 1, f2); await wait(250)
ok('intensity drag 9 → 2', (await sec.$eval('input[aria-label="Intensity value"]', (el) => el.value)) === '2', await sec.$eval('input[aria-label="Intensity value"]', (el) => el.value))

// sample strip: lot 3 is unrated
ok('lot 3 chip clicked', await clickText(sec, 'BR-036993/26'), null); await wait(250)
ok('switching to lot 3 shows the unrated prompt', (await readout(sec)) === 'Tap or drag to rate', await readout(sec))
await pointer(sec, 0, [8.5 / 9]); await wait(250)
ok('rating lot 3 → 9 · Extremely High', (await readout(sec)) === '9 · Extremely High', await readout(sec))
ok('back to lot 1 keeps its own state', (await clickText(sec, 'BR-036991/26')) && await wait(250) === undefined && (await readout(sec)) === '5 · Neither High nor Low', await readout(sec))
await (await sec.$('.root')).screenshot({ path: outDir + '/section-after.png' })

// ---- Cups ----
const cups = await findFrame('Defective −4')
if (!cups) { console.log('FAIL cups frame not found') } else {
  const before = await body(cups)
  ok('cups seed: 1 non-uniform + 1 defective without a type → "not counted"', before.includes('Not counted yet') && before.includes('(1 not counted)'), before.slice(0, 300))
  ok('Potato clicked', await clickText(cups, 'Potato', true), null); await wait(250)
  const after = await body(cups)
  ok('type picked → −8 and "2 non-uniform · 1 defective"', after.includes('−8') && after.includes('2 non-uniform · 1 defective'), after.slice(0, 300))
  ok('Cup 1 clicked once (→ non-uniform)', await clickText(cups, 'Cup 1', true), null); await wait(250)
  const after2 = await body(cups)
  ok('now 3 non-uniform → −10', after2.includes('−10') && after2.includes('3 non-uniform'), after2.slice(0, 300))
  await (await cups.$('.root')).screenshot({ path: outDir + '/cups-after.png' })
}
// ---- Describe overlay: the 2026-09-04 wheel pass ----
const rest = await byTitle('wheel at rest')
if (!rest) { console.log('FAIL wheel-at-rest frame not found') } else {
  const labels = await shownLabels(rest)
  const joined = labels.join(' | ')
  // The whole point of resting at 1.7×: at 1× only OTHER and SWEET cleared the ring.
  const missing = FAMS.filter((n) => !labels.some((l) => l.replace(/\s+/g, '') === n.replace(/\s+/g, '') || l === n.split('/')[0] + '/'))
  ok('rest: all nine family names are rendered', missing.length === 0, 'missing: ' + missing.join(', '))
  ok('rest: the wheel shows most of its 110 labels', labels.length >= 90, labels.length)

  // the lot strip moved INTO the overlay, and picks are per lot
  const picksRow = () => rest.evaluate(() => { const m = document.body.innerText.match(/DESCRIPTORS · \d+([\s\S]{0,120})/); return (m ? m[0] : '').replace(/\s+/g, ' ').trim() })
  const lot1 = await picksRow()
  ok('rest: lot 1 carries the seeded pick', lot1.includes('Jasmine'), lot1)
  ok('rest: lot 2 chip clicked', await clickText(rest, 'BR-036992/26'), null); await wait(300)
  const lot2 = await picksRow()
  ok('rest: lot 2 has its OWN (empty) picks', !lot2.includes('Jasmine') && /DESCRIPTORS · 0/.test(lot2), lot2)
  await clickText(rest, 'BR-036991/26'); await wait(300)
  ok('rest: back to lot 1 restores its picks', (await picksRow()).includes('Jasmine'), await picksRow())
}

const framed = await byTitle('Fruity framed')
if (!framed) { console.log('FAIL Fruity-framed frame not found') } else {
  const labels = await shownLabels(framed)
  // flyToNode floored at 2.2×: production's chord fit reached 1.35× and left 7 unnamed.
  const fruityLeaves = ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry', 'Raisin', 'Prune', 'Coconut', 'Cherry',
                        'Pomegranate', 'Pineapple', 'Grape', 'Apple', 'Peach', 'Pear', 'Grapefruit', 'Orange', 'Lemon', 'Lime']
  const gone = fruityLeaves.filter((n) => !labels.includes(n))
  ok('framed: all 18 Fruity leaves are named at the 2.2× floor', gone.length === 0, 'unnamed: ' + gone.join(', '))
}

const list = await byTitle('official checklist')
if (!list) { console.log('FAIL checklist frame not found') } else {
  const t = await body(list)
  ok('list: shows the 24 boxes of the §8.2 form', t.includes('24 boxes of the SCA-103'), t.slice(0, 200))
  // seeded flavor picks are Raspberry (Fruity>Berry) and Honey (Sweet>Brown Sugar)
  ok('list: Raspberry ticks Fruity AND Berry (§6.3.4: mark the category too)', t.includes('Fruity') && t.includes('Berry'), t.slice(0, 300))
  ok('list: the leaf is shown as the written-in term', t.includes('written in · Raspberry') && t.includes('written in · Honey'), t.slice(0, 400))
  ok('list: 4 boxes ticked by 2 picks — the cap unit differs from §6.3.1', t.includes('4 ticked by your 2 wheel picks'), t.slice(0, 260))
}

if (errors.length) { console.log('--- errors ---'); for (const e of errors) console.log(e) } else console.log('no page errors')
await browser.close()
