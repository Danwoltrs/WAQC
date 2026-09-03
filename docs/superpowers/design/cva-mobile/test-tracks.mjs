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
const outDir = '/private/tmp/claude-501/-Users-danielwolthers-Documents-GitHub-WAQC/449a465e-94a3-488f-b124-25d36a0f0468/scratchpad/design/shots'
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
await (await sec.$('.root')).screenshot({ path: outDir + '/v4-section-after.png' })

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
  await (await cups.$('.root')).screenshot({ path: outDir + '/v4-cups-after.png' })
}
if (errors.length) { console.log('--- errors ---'); for (const e of errors) console.log(e) } else console.log('no page errors')
await browser.close()
