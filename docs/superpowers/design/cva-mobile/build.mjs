// Builds every artboard for the "CVA on a phone" canvas from wheel-data.json
// (production geometry + camera states) and the token values lifted from
// src/app/globals.css, src/lib/cva/sections.ts and the step components.
//
// v2 (2026-09-03, after the standards re-read): step-major navigation with a
// sample strip, a linear 9-segment impression track + a continuous 0–15
// intensity track (tap or drag, integer snapping — SCA-103 §6.2), cooled
// second marks on both (SCA-104 §5.2 / SCA-103 §6.2), a Cups & uniformity
// step (SCA-104 §5.4), and a score pill that counts sections until complete.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const D = JSON.parse(readFileSync(join(here, 'wheel-data.json'), 'utf8'))

/* ------------------------------------------------------------------ tokens */
const SECTIONS = [
  { key: 'fragrance', label: 'Fragrance', accent: '#a9a454', hint: 'Dry grounds, before water. Breathe in. How intense and pleasant?' },
  { key: 'aroma', label: 'Aroma', accent: '#6b8e23', hint: 'Wet crust, just after the pour. The bloom of the cup.' },
  { key: 'flavor', label: 'Flavor', accent: '#b07946', hint: 'The peak of taste and retronasal aroma combined. The heart of it.' },
  { key: 'aftertaste', label: 'Aftertaste', accent: '#8a5a36', hint: 'What lingers after you swallow. Length and quality of the finish.' },
  { key: 'acidity', label: 'Acidity', accent: '#c2c63e', hint: 'Brightness and liveliness. Not sourness, but vibrancy.' },
  { key: 'sweetness', label: 'Sweetness', accent: '#e8a23d', hint: 'Perceived sweetness and roundness across the palate.' },
  { key: 'mouthfeel', label: 'Mouthfeel', accent: '#445763', hint: 'Body, texture and weight on the tongue.' },
  { key: 'overall', label: 'Overall', accent: '#6d6f54', hint: 'Your holistic impression. Does the cup come together?' },
]
const ROAST_ACCENT = '#6d6f54'
const DARK_ACCENT = '#151618'
const BAND_EXCELLENT = '#6b8e23'   // cvaBand(86.25)
const IMPRESSION_COLORS = ['rgb(239,68,68)', 'rgb(233,99,79)', 'rgb(212,138,62)', 'rgb(185,165,80)', 'rgb(154,160,166)', 'rgb(120,170,120)', 'rgb(90,185,100)', 'rgb(55,200,95)', 'rgb(34,197,94)']
const IMPRESSION_LABELS = ['Extremely Low', 'Very Low', 'Moderately Low', 'Slightly Low', 'Neither High nor Low', 'Slightly High', 'Moderately High', 'Very High', 'Extremely High']
// 13 steps: Roast · 8 sections · Cups (new, SCA-104 §5.4) · Score · Panel · Certify
const STEPS = [
  { label: 'Roast', accent: ROAST_ACCENT },
  ...SECTIONS.map((s) => ({ label: s.label, accent: s.accent })),
  { label: 'Cups', accent: DARK_ACCENT },
  { label: 'Score', accent: DARK_ACCENT }, { label: 'Panel', accent: DARK_ACCENT }, { label: 'Certify', accent: DARK_ACCENT },
]
const LOTS = ['BR-036991/26', 'BR-036992/26', 'BR-036993/26']   // sample references — never minted
const LOT = LOTS[0]

const hex2rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})` }
const soft = (hex) => hex2rgba(hex, 0.14)   // --cva-accent-soft = color-mix(accent 14%, transparent)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const doneThrough = (n) => STEPS.map((_, i) => i < n)

/* ------------------------------------------------------------------ chrome */
const BASE_CSS = `
    *{box-sizing:border-box}
    body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-size:14px;font-weight:400;-webkit-font-smoothing:antialiased;background:#e9e9ea}
    a{color:#556b2f}a:hover{color:#3f5022}
    button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;text-align:center}
    input,textarea{font:inherit;color:inherit}
    input::placeholder,textarea::placeholder{color:var(--muted);opacity:.8}
    /* light tokens = globals.css :root; dark = .dark  (hsl → hex) */
    .root{--bg:#ffffff;--fg:#000000;--card:#f9f9fa;--muted:#666666;--border:#e6e6e6;--card-solid:#f1f1f2;--hair:rgba(0,0,0,.06);--shadow:0 10px 40px rgba(0,0,0,.08);--cool:#3b82f6;--ease:cubic-bezier(.22,.61,.36,1);--spring:cubic-bezier(.34,1.56,.64,1)}
    .root.dark{--bg:#2a2a2a;--fg:#ffffff;--card:#2e2e2e;--muted:#999999;--border:#404040;--card-solid:#343434;--hair:rgba(255,255,255,.08);--shadow:0 10px 40px rgba(0,0,0,.45)}
    .scroll{overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}.scroll::-webkit-scrollbar{display:none}
    .xscroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.xscroll::-webkit-scrollbar{display:none}
    .micro{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted)}
    @keyframes cva-springpop{0%{transform:scale(.78) translateY(8px)}55%{transform:scale(1.1) translateY(-8px)}100%{transform:scale(1) translateY(0)}}
    .pop{animation:cva-springpop .55s var(--spring)}
    @keyframes cva-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .fadein{animation:cva-fadein .4s var(--ease)}
    .track{touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:pointer}
`

const head = (title, css = '') => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>${BASE_CSS}${css}
  </style>
</helmet>
`
const tail = (props, logic) => `</x-dc>
<script data-dc-script data-props='${props}'>
${logic}
</script>
</body>
</html>
`

const CHEVRON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg>`

/** Static sample strip (screens whose per-sample state is not interactive). */
function staticStrip(accent, dots = ['done', 'done', 'none']) {
  return LOTS.map((ref, i) => {
    const on = i === 0
    const dot = dots[i] === 'done' ? '#22c55e' : dots[i] === 'part' ? '#eab308' : 'var(--hair)'
    return `<span style="flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 10px;border-radius:999px;border:.5px solid ${on ? accent : 'var(--border)'};background:${on ? soft(accent) : 'transparent'};font-size:12px;font-weight:${on ? 700 : 500};color:${on ? 'var(--fg)' : 'var(--muted)'};white-space:nowrap"><span style="width:8px;height:8px;border-radius:999px;background:${dot}"></span>${ref}</span>`
  }).join('')
}

/**
 * The phone shell around a journey step (step-major: the section is the page,
 * the sample strip under the ribbon switches lots). `pill` = {value, label, color}.
 */
function shell({ accent, step, done, pill, nextLabel, backDisabled = false, nextDisabled = false, strip }, content) {
  const cur = STEPS[step]
  const nextStep = STEPS[step + 1]
  const bars = STEPS.map((s, i) => {
    const isCur = i === step
    const fill = done[i] ? '100%' : isCur ? '50%' : '0%'
    const ring = isCur ? `box-shadow:0 0 0 3px ${soft(accent)};` : ''
    const bg = done[i] || isCur ? s.accent : 'transparent'
    return `<div style="flex:1;height:30px;display:flex;align-items:center"><div style="width:100%;height:4px;border-radius:${isCur ? 6 : 4}px;background:var(--hair);overflow:hidden;${ring}"><div style="width:${fill};height:100%;background:${bg};border-radius:4px"></div></div></div>`
  }).join('')
  return `<div class="root {{themeCls}}" style="position:relative;width:390px;height:844px;overflow:hidden;background:var(--bg);color:var(--fg);display:flex;flex-direction:column">
  <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(115% 80% at 50% -12%, ${soft(accent)}, transparent 62%)"></div>
  <div style="height:54px;flex:none"></div>
  <div style="position:relative;display:flex;align-items:center;gap:6px;height:52px;padding:0 10px 0 4px;border-bottom:.5px solid var(--border);flex:none">
    <button aria-label="Back to Specialty (CVA)" style="flex:none;width:44px;height:44px;border:0;background:transparent;border-radius:12px;display:grid;place-items:center;color:var(--muted)">${CHEVRON}</button>
    <div style="flex:1;min-width:0;line-height:1.2">
      <div style="font-size:14px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cur.label}</div>
      <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Specialty CVA · Saved</div>
    </div>
    <div style="flex:none;display:flex;flex-direction:column;align-items:center;gap:1px;height:44px;padding:5px 12px;border-radius:14px;border:.5px solid var(--border);background:var(--card)"><span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.9px;color:var(--muted)">${pill.label}</span><span style="font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;color:${pill.color ?? 'var(--fg)'}">${pill.value}</span></div>
  </div>
  <div style="position:relative;padding:0 14px;flex:none">
    <div style="display:flex;gap:4px;padding:0 2px">${bars}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 2px 6px;margin-top:-6px"><span style="font-size:11px;font-weight:700;color:${accent}">${cur.label}</span><span style="font-size:11px;font-weight:600;color:var(--muted)">${nextStep ? 'Next · ' + nextStep.label : 'Last step'}</span></div>
  </div>
  <div class="xscroll" style="position:relative;display:flex;gap:6px;align-items:center;height:44px;padding:0 16px;border-bottom:.5px solid var(--border);flex:none">
    ${strip ?? staticStrip(accent)}
  </div>
  <div class="scroll" style="position:relative;flex:1;min-height:0;padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;align-items:center">
${content}
  </div>
  <div style="position:relative;flex:none;display:flex;gap:12px;padding:12px 16px 46px;border-top:.5px solid var(--border);background:var(--bg)">
    <button ${backDisabled ? 'disabled' : ''} style="flex:none;min-width:96px;height:48px;border-radius:16px;border:.5px solid var(--border);background:transparent;font-size:14px;font-weight:700;color:var(--muted);${backDisabled ? 'opacity:.35;' : ''}">Back</button>
    <button ${nextDisabled ? 'disabled' : ''} style="flex:1;height:48px;border-radius:16px;border:0;background:${accent};color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 18px ${soft(accent)};${nextDisabled ? 'opacity:.35;' : ''}">${nextLabel}</button>
  </div>
</div>
`
}

const THEME_LOGIC = `class Component extends DCLogic {
  renderVals() { return { themeCls: this.props.dark ? 'dark' : '' } }
}`
const darkProp = `"dark":{"editor":"boolean","default":false,"section":"Theme"}`
const preview = `"$preview":{"width":390,"height":844}`
const RATED_PILL = (n) => ({ label: 'Sections', value: n + ' / 8' })
const SCORE_PILL = { label: 'Score', value: '86.25', color: BAND_EXCELLENT }

/* ------------------------------------------------------------- 1. Roast */
function buildRoast() {
  const accent = ROAST_ACCENT
  const content = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:${accent}">Before you taste</span>
      <h2 style="margin:0;font-size:30px;font-weight:800;line-height:1;letter-spacing:-.6px">Roast level</h2>
      <p style="margin:0;max-width:340px;font-size:14px;font-weight:500;color:var(--muted)">Recorded visually before tasting (SCA-102). Cupping level ≈ CIELAB L* 26–29.</p>
    </div>
    <div style="width:100%;display:flex;flex-direction:column;gap:18px;border-radius:20px;border:.5px solid var(--border);padding:20px 16px;background:var(--card);box-shadow:var(--shadow)">
      <div style="text-align:center;font-size:16px;font-weight:800;color:${accent}">{{currentLabel}}<span style="font-weight:600;color:var(--muted)">{{agtronLabel}}</span></div>
      <div style="display:flex;gap:8px">
        <sc-for list="{{levels}}" as="l" hint-placeholder-count="5">
          <button style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:16px;border:.5px solid {{l.border}};background:{{l.bg}};box-shadow:{{l.shadow}};padding:14px 4px 12px;font-size:11px;font-weight:700;line-height:1.15;color:{{l.color}}" onClick="{{l.pick}}">
            <span style="width:40px;height:40px;border-radius:999px;background:{{l.swatch}};box-shadow:inset 0 2px 6px rgba(0,0,0,.35);outline:{{l.outline}};outline-offset:{{l.outlineOffset}}"></span>
            <span>{{l.label}}</span>
          </button>
        </sc-for>
      </div>
      <label style="display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:600;color:var(--muted)">Agtron <span style="font-weight:400;opacity:.7">(optional)</span>
        <input inputmode="numeric" placeholder="63" value="{{agtron}}" onChange="{{onAgtron}}" style="height:44px;width:90px;border-radius:12px;border:.5px solid var(--border);background:var(--card);text-align:center;font-size:16px;font-weight:800;outline:none">
      </label>
    </div>`
  const logic = `const LEVELS = [
  { key: 'light', label: 'Light', swatch: 'rgb(214,178,128)' },
  { key: 'medium-light', label: 'Medium-Light', swatch: 'rgb(178,130,78)' },
  { key: 'medium', label: 'Medium', swatch: 'rgb(138,90,48)' },
  { key: 'medium-dark', label: 'Medium-Dark', swatch: 'rgb(86,54,32)' },
  { key: 'dark', label: 'Dark', swatch: 'rgb(40,26,16)' },
]
const ACCENT = '${accent}', SOFT = '${soft(accent)}'
class Component extends DCLogic {
  S() { return Object.assign({ level: 'medium', agtron: '63' }, this.state || {}) }
  renderVals() {
    const s = this.S()
    const cur = LEVELS.find((l) => l.key === s.level)
    return {
      themeCls: this.props.dark ? 'dark' : '',
      currentLabel: cur ? cur.label : 'Pick a level',
      agtronLabel: cur && s.agtron ? ' · Agtron ' + s.agtron : '',
      agtron: s.agtron,
      onAgtron: (e) => this.setState({ agtron: String(e.target.value).replace(/[^0-9]/g, '').slice(0, 3) }),
      levels: LEVELS.map((l) => {
        const on = l.key === s.level
        return {
          label: l.label, swatch: l.swatch,
          border: on ? ACCENT : 'var(--border)',
          bg: on ? SOFT : 'transparent',
          shadow: on ? '0 6px 18px ' + SOFT : 'none',
          color: on ? 'var(--fg)' : 'var(--muted)',
          outline: on ? '3px solid ' + ACCENT : '2px solid var(--bg)',
          outlineOffset: on ? '2px' : '0px',
          pick: () => this.setState({ level: l.key }),
        }
      }),
    }
  }
}`
  return head('Roast', '') + shell({ accent, step: 0, done: doneThrough(0), pill: RATED_PILL(0), nextLabel: 'Begin tasting', backDisabled: true, strip: staticStrip(accent, ['done', 'done', 'none']) }, content) + tail(`{${darkProp},${preview}}`, logic)
}

/* --------------------------------------------------- 2. Section (Main) */
function buildSection() {
  const sec = SECTIONS[3]   // Aftertaste — step 4
  const accent = sec.accent
  const strip = `<sc-for list="{{samples}}" as="x" hint-placeholder-count="3">
      <button style="flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 10px;border-radius:999px;border:.5px solid {{x.border}};background:{{x.bg}};font-size:12px;font-weight:{{x.weight}};color:{{x.color}};white-space:nowrap" onClick="{{x.pick}}"><span style="width:8px;height:8px;border-radius:999px;background:{{x.dot}}"></span>{{x.ref}}</button>
    </sc-for>`
  const content = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:${accent}">Section 4 of 8 · Affective Impression</span>
      <h2 style="margin:0;font-size:30px;font-weight:800;line-height:1;letter-spacing:-.6px;color:${accent}">${sec.label}</h2>
      <p style="margin:0;max-width:320px;font-size:14px;font-weight:500;line-height:1.4;color:var(--muted)">${sec.hint}</p>
    </div>

    <!-- 9-point impression track: one row, tap or drag, snaps to a segment (SCA-104 fig. 2) -->
    <div style="width:100%;display:flex;flex-direction:column;gap:8px">
      <div class="track" style="position:relative;padding-top:14px" onPointerDown="{{impDown}}" onPointerMove="{{impMove}}" onPointerUp="{{impUp}}" onPointerCancel="{{impUp}}">
        <sc-if value="{{impShifted}}" hint-placeholder-val="{{false}}">
          <div style="position:absolute;top:4px;height:2px;background:var(--cool);left:{{impArrowLeft}};width:{{impArrowWidth}};pointer-events:none"></div>
          <div style="position:absolute;top:0;width:10px;height:10px;border-top:2px solid var(--cool);border-right:2px solid var(--cool);left:{{impArrowHeadLeft}};transform:rotate({{impArrowRot}});pointer-events:none"></div>
        </sc-if>
        <div style="display:flex;gap:3px;height:56px">
          <sc-for list="{{segs}}" as="t" hint-placeholder-count="9">
            <div class="{{t.cls}}" style="flex:1;min-width:0;border-radius:12px;background:{{t.bg}};box-shadow:{{t.shadow}};transform:{{t.tf}};z-index:{{t.z}};display:grid;place-items:center;font-size:19px;font-weight:800;color:rgba(255,255,255,.96);text-shadow:0 1px 3px rgba(0,0,0,.3);outline:{{t.outline}};outline-offset:-6px;transition:transform .28s var(--spring), box-shadow .28s">{{t.n}}</div>
          </sc-for>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:17px;font-weight:800;letter-spacing:-.2px;white-space:nowrap"><span style="width:14px;height:14px;border-radius:5px;background:{{readoutColor}}"></span>{{readout}}</span>
        <button aria-pressed="{{cooledOn}}" style="display:inline-flex;align-items:center;gap:6px;height:36px;border-radius:14px;border:.5px {{coolBorderStyle}} {{coolBorder}};background:{{coolBg}};padding:0 12px;font-size:12px;font-weight:600;color:{{coolColor}};white-space:nowrap" onClick="{{toggleCooled}}"><span aria-hidden="true" style="font-size:13px">{{coolGlyph}}</span>Cooled</button>
      </div>
      <sc-if value="{{impShifted}}" hint-placeholder-val="{{false}}">
        <div style="margin-top:-4px;font-size:12.5px;font-weight:700;color:var(--cool)">{{shiftLine}}</div>
      </sc-if>
    </div>

    <!-- 0–15 intensity: a continuous track with the form's ticks; tap anywhere or drag, nearest integer recorded (SCA-103 §6.2) -->
    <div style="width:100%;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="micro">Intensity (0–15)</span>
        <span style="display:inline-flex;align-items:center;gap:8px"><sc-if value="{{intShifted}}" hint-placeholder-val="{{false}}"><span style="font-size:12px;font-weight:700;color:var(--cool)">{{intShiftLine}}</span></sc-if><input inputmode="numeric" value="{{intensityText}}" onChange="{{onIntensity}}" aria-label="Intensity value" style="height:36px;width:48px;border-radius:10px;border:.5px solid var(--border);background:var(--card);text-align:center;font-size:14px;font-weight:700;outline:none"></span>
      </div>
      <div class="track" style="position:relative;height:56px" onPointerDown="{{intDown}}" onPointerMove="{{intMove}}" onPointerUp="{{intUp}}" onPointerCancel="{{intUp}}">
        <div style="position:absolute;left:14px;right:14px;top:22px;height:12px;border-radius:6px;background:linear-gradient(90deg, var(--card-solid), ${hex2rgba(accent, 0.35)});border:.5px solid var(--border)"></div>
        <div style="position:absolute;left:14px;top:22px;height:12px;border-radius:6px;background:${accent};width:{{intFillW}};pointer-events:none"></div>
        <sc-for list="{{ticks}}" as="k" hint-placeholder-count="16">
          <div style="position:absolute;top:36px;left:{{k.left}};width:1px;height:{{k.h}};background:var(--muted);opacity:.6;pointer-events:none"></div>
        </sc-for>
        <sc-if value="{{intShifted}}" hint-placeholder-val="{{false}}">
          <div style="position:absolute;top:14px;width:28px;height:28px;margin-left:-14px;border-radius:999px;border:2px dashed var(--cool);left:{{intInitLeft}};pointer-events:none"></div>
        </sc-if>
        <div style="position:absolute;top:14px;width:28px;height:28px;margin-left:-14px;border-radius:999px;background:var(--bg);border:2px solid ${accent};box-shadow:0 2px 8px rgba(0,0,0,.2);display:grid;place-items:center;font-size:11px;font-weight:800;color:${accent};left:{{intThumbLeft}};transition:left .12s var(--ease);pointer-events:none">{{intVal}}</div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted)"><span>Low</span><span>Medium</span><span>High</span></div>
    </div>

    <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:6px">
      <button style="width:100%;height:48px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:16px;border:.5px solid var(--border);background:var(--card);font-size:13px;font-weight:700;white-space:nowrap" onClick="{{describe}}">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v2.4M21 12h-2.4M12 21v-2.4M3 12h2.4"></path></svg>
        Describe
        <span style="font-weight:600;color:var(--muted)">Flavor &amp; Aftertaste</span>
        <span style="border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;color:#fff;background:${accent}">2 / 5</span>
        <span style="border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;border:.5px solid ${accent};color:${accent}">tastes 1 / 2</span>
      </button>
      <span style="font-size:11px;font-weight:600;color:var(--muted)">One list shared by Flavor and Aftertaste · edit anytime</span>
      <sc-if value="{{hasHint}}" hint-placeholder-val="{{false}}"><span class="fadein" style="font-size:11.5px;font-weight:600;border-radius:12px;border:.5px solid var(--border);background:var(--card);padding:8px 12px">{{hint}}</span></sc-if>
    </div>

    <textarea placeholder="Affective note (optional) — a short justification for the score." style="width:100%;min-height:64px;border-radius:16px;border:.5px solid var(--border);background:var(--card);padding:16px;font-size:14px;outline:none;resize:vertical"></textarea>`
  const logic = `const COLORS = ${JSON.stringify(IMPRESSION_COLORS)}
const LABELS = ${JSON.stringify(IMPRESSION_LABELS)}
const LOTS = ${JSON.stringify(LOTS)}
const ACCENT = '${accent}', SOFT = '${soft(accent)}'
const SEED = { 0: { value: 6, final: null, intensity: 8, intensityFinal: null, cooled: false }, 1: { value: 7, final: null, intensity: 11, intensityFinal: null, cooled: false }, 2: { value: null, final: null, intensity: 0, intensityFinal: null, cooled: false } }
class Component extends DCLogic {
  S() { return Object.assign({ active: 0, samples: SEED, hint: null }, this.state || {}) }
  cur() { const s = this.S(); return s.samples[s.active] }
  patch(p) { const s = this.S(); const samples = Object.assign({}, s.samples); samples[s.active] = Object.assign({}, this.cur(), p); this.setState({ samples }) }
  // --- tracks: tap anywhere snaps to the nearest position; a drag refines it ---
  segAt(e) { const r = e.currentTarget.getBoundingClientRect(); const x = Math.min(r.width - 0.01, Math.max(0, e.clientX - r.left)); return Math.floor((x / r.width) * 9) + 1 }
  intAt(e) { const r = e.currentTarget.getBoundingClientRect(); const x = Math.min(r.width - 14, Math.max(14, e.clientX - r.left)); return Math.round(((x - 14) / (r.width - 28)) * 15) }
  grab(e) { try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {} }
  applyImp(n) { const c = this.cur(); if (c.cooled && c.value != null) this.patch({ final: n }); else this.patch({ value: n }) }
  applyInt(n) { const c = this.cur(); if (c.cooled && c.intensity > 0) this.patch({ intensityFinal: n }); else this.patch({ intensity: n }) }
  renderVals() {
    const s = this.S(), c = this.cur()
    const impFinal = c.cooled ? c.final : null
    const impShifted = impFinal != null && impFinal !== c.value
    const intFinal = c.cooled ? c.intensityFinal : null
    const intShifted = intFinal != null && intFinal !== c.intensity
    const shown = impFinal != null ? impFinal : c.value
    const segs = COLORS.map((color, i) => {
      const n = i + 1
      const isInitial = c.value === n
      const isFinal = impFinal === n
      const active = impFinal != null ? isFinal : isInitial
      const ring = '0 16px 40px rgba(0,0,0,.28), 0 0 0 3px var(--bg), 0 0 0 6px ' + color
      return {
        n: String(n), bg: color,
        cls: active ? 'pop' : '',
        shadow: active ? ring : '0 4px 14px rgba(0,0,0,.12)',
        tf: active ? 'scale(1.08)' : 'none',
        z: active ? '4' : '1',
        outline: impShifted && isInitial ? '2px dashed rgba(255,255,255,.9)' : 'none',
      }
    })
    const segCentre = (n) => ((n - 0.5) / 9 * 100).toFixed(2) + '%'
    const a = c.value || 1, b = impFinal || a
    const left = Math.min(a, b), right = Math.max(a, b)
    const intPos = (v) => 'calc(14px + (100% - 28px) * ' + (v / 15).toFixed(4) + ')'
    const shownInt = intFinal != null ? intFinal : c.intensity
    return {
      themeCls: this.props.dark ? 'dark' : '',
      samples: LOTS.map((ref, i) => {
        const on = i === s.active, rated = s.samples[i].value != null
        return { ref, border: on ? ACCENT : 'var(--border)', bg: on ? SOFT : 'transparent', weight: on ? '700' : '500', color: on ? 'var(--fg)' : 'var(--muted)', dot: rated ? '#22c55e' : 'var(--hair)', pick: () => this.setState({ active: i }) }
      }),
      segs,
      impDown: (e) => { this._drag = 'imp'; this.grab(e); this.applyImp(this.segAt(e)) },
      impMove: (e) => { if (this._drag === 'imp') this.applyImp(this.segAt(e)) },
      impUp: () => { this._drag = null },
      impShifted,
      impArrowLeft: segCentre(left), impArrowWidth: ((right - left) / 9 * 100).toFixed(2) + '%',
      impArrowHeadLeft: 'calc(' + segCentre(b) + ' - ' + (b >= a ? '9px' : '1px') + ')', impArrowRot: b >= a ? '45deg' : '225deg',
      readout: shown != null ? shown + ' · ' + LABELS[shown - 1] : 'Tap or drag to rate',
      readoutColor: shown != null ? COLORS[shown - 1] : 'var(--hair)',
      shiftLine: impShifted ? c.value + ' → ' + impFinal + ' · ' + (impFinal > c.value ? 'rose' : 'fell') + ' as it cooled · Final ' + impFinal : '',
      cooledOn: c.cooled ? 'true' : 'false',
      coolBorderStyle: c.cooled ? 'solid' : 'dashed', coolBorder: c.cooled ? 'var(--cool)' : 'var(--border)',
      coolBg: c.cooled ? 'rgba(59,130,246,.1)' : 'transparent', coolColor: c.cooled ? 'var(--cool)' : 'var(--muted)', coolGlyph: c.cooled ? '●' : '○',
      toggleCooled: () => { if (c.cooled) this.patch({ cooled: false, final: null, intensityFinal: null }); else this.patch({ cooled: true }) },
      intensityText: shownInt ? String(shownInt) : '',
      onIntensity: (e) => { const raw = String(e.target.value).replace(/[^0-9]/g, '').slice(0, 2); this.applyInt(raw === '' ? 0 : Math.min(15, parseInt(raw, 10))) },
      intDown: (e) => { this._drag = 'int'; this.grab(e); this.applyInt(this.intAt(e)) },
      intMove: (e) => { if (this._drag === 'int') this.applyInt(this.intAt(e)) },
      intUp: () => { this._drag = null },
      intVal: String(shownInt),
      intThumbLeft: intPos(shownInt),
      intFillW: 'calc((100% - 28px) * ' + (shownInt / 15).toFixed(4) + ')',
      intInitLeft: intPos(c.intensity),
      intShifted,
      intShiftLine: intShifted ? c.intensity + ' → ' + intFinal : '',
      ticks: Array.from({ length: 16 }, (_, i) => ({ left: intPos(i), h: i % 5 === 0 ? '10px' : '5px' })),
      describe: () => { this.setState({ hint: 'Opens the flavour wheel on the Flavor & Aftertaste tab — see the Describe artboards.' }); clearTimeout(this._t); this._t = setTimeout(() => this.setState({ hint: null }), 2600) },
      hasHint: !!s.hint, hint: s.hint || '',
    }
  }
}`
  return head('Aftertaste', '') + shell({ accent, step: 4, done: doneThrough(4), pill: RATED_PILL(4), nextLabel: 'Next', strip }, content) + tail(`{${darkProp},${preview}}`, logic)
}

/* ---------------------------------------------- 3. Cups & uniformity (new) */
const CUP_ICON = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 12h24l-2.6 15.2A3 3 0 0 1 24.4 30H11.6a3 3 0 0 1-3-2.8Z"></path><ellipse cx="18" cy="12" rx="12" ry="3.5"></ellipse></svg>`
function buildCups() {
  const accent = DARK_ACCENT
  const strip = `<sc-for list="{{samples}}" as="x" hint-placeholder-count="3">
      <button style="flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 10px;border-radius:999px;border:.5px solid {{x.border}};background:{{x.bg}};font-size:12px;font-weight:{{x.weight}};color:{{x.color}};white-space:nowrap" onClick="{{x.pick}}"><span style="width:8px;height:8px;border-radius:999px;background:{{x.dot}}"></span>{{x.ref}}</button>
    </sc-for>`
  const content = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:${accent}">After the last liquoring round</span>
      <h2 style="margin:0;font-size:30px;font-weight:800;line-height:1;letter-spacing:-.6px">Cups</h2>
      <p style="margin:0;max-width:320px;font-size:14px;font-weight:500;line-height:1.4;color:var(--muted)">Tap a cup once if it is qualitatively different from the rest, twice if it carries a sensory defect.</p>
    </div>

    <div style="width:100%;display:flex;flex-direction:column;gap:14px;border-radius:20px;border:.5px solid var(--border);padding:18px 14px;background:var(--card);box-shadow:var(--shadow)">
      <div style="display:flex;gap:8px">
        <sc-for list="{{cups}}" as="c" hint-placeholder-count="5">
          <button aria-label="{{c.aria}}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;height:84px;border-radius:16px;border:.5px solid {{c.border}};background:{{c.bg}};color:{{c.color}};padding-top:10px;font-size:11px;font-weight:700" onClick="{{c.pick}}">${CUP_ICON}<span>{{c.n}}</span></button>
        </sc-for>
      </div>
      <div style="display:flex;justify-content:center;gap:16px;font-size:11px;font-weight:600;color:var(--muted)"><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:#eab308"></span>Non-uniform −2</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:#ef4444"></span>Defective −4</span></div>

      <sc-if value="{{anyDefect}}" hint-placeholder-val="{{true}}">
        <div style="display:flex;flex-direction:column;gap:8px">
          <span class="micro">Defect type <span style="font-weight:600;text-transform:none;letter-spacing:0">(required)</span></span>
          <div style="display:flex;gap:8px">
            <sc-for list="{{types}}" as="t" hint-placeholder-count="3">
              <button style="flex:1;height:40px;border-radius:999px;border:.5px solid {{t.border}};background:{{t.bg}};color:{{t.color}};font-size:13px;font-weight:600" onClick="{{t.pick}}">{{t.name}}</button>
            </sc-for>
          </div>
          <sc-if value="{{typeMissing}}" hint-placeholder-val="{{false}}"><p style="margin:0;font-size:12px;font-weight:600;color:#ef4444">Not counted yet — a defect needs both the cups and the type (SCA-104 §5.4.1).</p></sc-if>
        </div>
      </sc-if>
      <sc-if value="{{autoNote}}" hint-placeholder-val="{{false}}"><p style="margin:0;font-size:12px;color:var(--muted)">Defective cups are also marked non-uniform (§5.4.2) — unless all five are evenly defective.</p></sc-if>
    </div>

    <div style="width:100%;display:flex;align-items:center;justify-content:space-between;border-radius:16px;border:.5px solid var(--border);background:var(--card);padding:12px 16px">
      <span style="font-size:12.5px;font-weight:600;color:var(--muted)">{{penaltyLine}}</span>
      <span style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:{{penaltyColor}}">{{penalty}}</span>
    </div>`
  const logic = `const LOTS = ${JSON.stringify(LOTS)}
const ACCENT = '${accent}', SOFT = '${soft(accent)}'
const TYPES = ['Moldy', 'Phenolic', 'Potato']
const SEED = { 0: { cups: ['none', 'nu', 'none', 'def', 'none'], type: null }, 1: { cups: ['none', 'none', 'none', 'none', 'none'], type: null }, 2: { cups: ['none', 'none', 'none', 'none', 'none'], type: null } }
class Component extends DCLogic {
  S() { return Object.assign({ active: 0, samples: SEED }, this.state || {}) }
  cur() { const s = this.S(); return s.samples[s.active] }
  patch(p) { const s = this.S(); const samples = Object.assign({}, s.samples); samples[s.active] = Object.assign({}, this.cur(), p); this.setState({ samples }) }
  renderVals() {
    const s = this.S(), c = this.cur()
    const defs = c.cups.filter((x) => x === 'def').length
    const allDef = defs === 5
    // §5.4.2: a defective cup is also non-uniform, unless all five are evenly defective
    const nu = allDef ? 0 : c.cups.filter((x) => x === 'nu' || x === 'def').length
    const counted = c.type ? defs : 0
    const penalty = 2 * nu + 4 * counted
    return {
      themeCls: this.props.dark ? 'dark' : '',
      samples: LOTS.map((ref, i) => {
        const on = i === s.active, touched = s.samples[i].cups.some((x) => x !== 'none')
        return { ref, border: on ? ACCENT : 'var(--border)', bg: on ? SOFT : 'transparent', weight: on ? '700' : '500', color: on ? 'var(--fg)' : 'var(--muted)', dot: touched ? '#eab308' : '#22c55e', pick: () => this.setState({ active: i }) }
      }),
      cups: c.cups.map((st, i) => ({
        n: 'Cup ' + (i + 1), aria: 'Cup ' + (i + 1) + ' — ' + st,
        border: st === 'def' ? '#ef4444' : st === 'nu' ? '#eab308' : 'var(--border)',
        bg: st === 'def' ? 'rgba(239,68,68,.12)' : st === 'nu' ? 'rgba(234,179,8,.14)' : 'transparent',
        color: st === 'def' ? '#ef4444' : st === 'nu' ? '#a16207' : 'var(--muted)',
        pick: () => { const cups = c.cups.slice(); cups[i] = st === 'none' ? 'nu' : st === 'nu' ? 'def' : 'none'; const stillDef = cups.some((x) => x === 'def'); this.patch({ cups, type: stillDef ? c.type : null }) },
      })),
      anyDefect: defs > 0,
      typeMissing: defs > 0 && !c.type,
      autoNote: defs > 0 && !allDef,
      types: TYPES.map((t) => { const on = c.type === t; return { name: t, border: on ? '#ef4444' : 'var(--border)', bg: on ? 'rgba(239,68,68,.12)' : 'transparent', color: on ? '#ef4444' : 'var(--muted)', pick: () => this.patch({ type: on ? null : t }) } }),
      penaltyLine: nu + ' non-uniform · ' + counted + ' defective' + (defs > counted ? ' (' + (defs - counted) + ' not counted)' : ''),
      penalty: penalty ? '−' + penalty : '0',
      penaltyColor: penalty ? '#ef4444' : 'var(--fg)',
    }
  }
}`
  return head('Cups', '') + shell({ accent, step: 9, done: doneThrough(9), pill: RATED_PILL(8), nextLabel: 'Reveal score', strip }, content) + tail(`{${darkProp},${preview}}`, logic)
}

/* ------------------------------------------------------------- 4. Wheel */
const WHEEL_CSS = `
    .wheel-arcs path{stroke:#2E2E29;stroke-width:.9;cursor:pointer}
    .wheel-wedge.is-picked path{stroke:#2E2E29;stroke-width:2}
    .wheel-dot{display:none;fill:#f3f0e8;pointer-events:none}
    .wheel-wedge.is-picked .wheel-dot{display:block}
    .wheel-label{user-select:none;font-family:inherit;pointer-events:none}
    .pill{display:inline-flex;align-items:center;gap:7px;background:var(--card-solid);border:.5px solid var(--border);border-radius:999px;padding:0 14px 0 12px;height:40px;font-size:12px;font-weight:700;color:var(--fg)}
    @keyframes wheel-pulse{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
`
const STICK_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg>`
const CHEV_UP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"></path></svg>`
const CHEV_DOWN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`

function wheelSvg() {
  const fams = D.families.map((f) => f.name)
  let s = `<svg width="440" height="440" style="display:block;overflow:visible" aria-label="Flavour wheel">`
  s += `<g class="wheel-arcs">`
  for (const f of fams) {
    s += `<g class="wheel-fam">`
    for (const n of D.nodes.filter((n) => n.family === f)) {
      s += `<g class="wheel-wedge {{pc.${n.id}}}" style="color:${n.fill}" onClick="{{pk.${n.id}}}"><path d="${n.d}" fill="${n.fill}"></path><circle class="wheel-dot" cx="${n.dot.x}" cy="${n.dot.y}" r="2.2"></circle></g>`
    }
    s += `</g>`
  }
  s += `</g>`
  s += `<circle cx="220" cy="220" r="57" fill="rgba(0,0,0,0.002)" style="cursor:pointer" onClick="{{zoomOut}}"></circle>`
  for (const ring of [1, 2, 3]) {
    s += `<g class="wheel-labels" style="font-size:{{fs${ring}}}px">`
    for (const n of D.nodes.filter((n) => n.ring === ring)) {
      const g = n.label
      const text = g.lines.length === 1 ? esc(g.lines[0]) : `<tspan x="${g.x}" dy="-0.52em">${esc(g.lines[0])}</tspan><tspan x="${g.x}" dy="1.06em">${esc(g.lines[1])}</tspan>`
      s += `<g class="wheel-lw" style="display:{{lv.${n.id}}}"><text class="wheel-label" x="${g.x}" y="${g.y}" font-weight="${g.weight}" fill="${n.labelFill}" text-anchor="${g.anchor}" dominant-baseline="middle" transform="rotate(${g.deg} ${g.x} ${g.y})">${text}</text></g>`
    }
    s += `</g>`
  }
  s += `</svg>`
  return s
}

function buildWheel({ title, group, framed, trayOpen, stick }) {
  const sceneScale = (D.wheelSize / D.VIEW).toFixed(6)
  const content = `<div class="root {{themeCls}}" style="position:relative;width:390px;height:844px;overflow:hidden;background:var(--bg);color:var(--fg);display:flex;flex-direction:column">
  <div style="height:54px;flex:none"></div>
  <div style="position:relative;display:flex;align-items:center;gap:6px;height:52px;padding:0 8px 0 12px;border-bottom:.5px solid var(--border);flex:none;background:var(--bg)">
    <div class="xscroll" role="tablist" style="display:flex;gap:6px;flex:1;min-width:0">
      <sc-for list="{{tabs}}" as="t" hint-placeholder-count="3">
        <button role="tab" style="flex:none;height:36px;padding:0 12px;border-radius:999px;border:.5px solid {{t.border}};background:{{t.bg}};color:{{t.color}};font-size:12px;font-weight:700;white-space:nowrap" onClick="{{t.pick}}">{{t.label}}</button>
      </sc-for>
    </div>
    <sc-if value="{{isWheel}}" hint-placeholder-val="{{true}}">
      <button aria-label="Thumbstick on or off" style="flex:none;width:44px;height:44px;border-radius:999px;border:.5px solid {{stickBorder}};background:{{stickBg}};color:{{stickColor}};display:grid;place-items:center" onClick="{{toggleStick}}">${STICK_ICON}</button>
    </sc-if>
    <button aria-label="Close describe" style="flex:none;width:44px;height:44px;border-radius:999px;border:.5px solid var(--border);background:transparent;font-size:18px;font-weight:700;display:grid;place-items:center">×</button>
  </div>

  <div style="position:relative;flex:1;min-height:0;overflow:hidden">
    <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(130% 130% at 50% 50%, {{accentSoft}} 0%, transparent 96%)"></div>

    <sc-if value="{{isWheel}}" hint-placeholder-val="{{true}}">
      <div style="position:absolute;inset:0;overflow:hidden;background:#2E2E29;user-select:none">
        <div style="position:absolute;inset:0;transform-origin:50% 50%;transform:{{cam}};transition:transform .55s var(--ease)">
          <div style="position:absolute;left:50%;top:50%;width:440px;height:440px;margin:-220px 0 0 -220px;transform:scale(${sceneScale});transform-origin:50% 50%">
            ${wheelSvg()}
          </div>
        </div>
        <sc-if value="{{showBack}}" hint-placeholder-val="{{false}}">
          <button class="pill" style="position:absolute;top:12px;left:12px;z-index:6" onClick="{{zoomOut}}"><span aria-hidden="true">←</span> {{backLabel}}</button>
        </sc-if>
        <sc-if value="{{showHome}}" hint-placeholder-val="{{false}}">
          <button class="pill" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;height:32px;padding:0 11px;font-size:10.5px;letter-spacing:.4px" onClick="{{zoomOut}}">centre · zoom out</button>
        </sc-if>
        <div aria-live="polite" class="pill" style="position:absolute;top:12px;right:12px;z-index:6;height:32px;padding:0 10px;font-size:11px;pointer-events:none"><span>Picks {{wheelCount}}/5</span></div>
        <sc-if value="{{trayClosed}}" hint-placeholder-val="{{true}}">
          <div class="xscroll" style="position:absolute;left:0;right:0;bottom:86px;height:44px;display:flex;gap:6px;align-items:center;padding:0 12px;z-index:8">
            <sc-for list="{{rail}}" as="f" hint-placeholder-count="9">
              <button style="flex:none;height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px 0 8px;border-radius:999px;border:1px solid {{f.border}};background:{{f.bg}};color:{{f.color}};font-size:12px;font-weight:700;white-space:nowrap" onClick="{{f.pick}}"><span style="width:8px;height:8px;border-radius:999px;background:{{f.dot}}"></span>{{f.name}}</button>
            </sc-for>
          </div>
        </sc-if>
        <sc-if value="{{stickVisible}}" hint-placeholder-val="{{true}}">
          <div role="group" aria-label="Pan the wheel with your thumb" style="position:absolute;bottom:142px;{{stickSideCss}};width:112px;height:112px;border-radius:999px;background:rgba(0,0,0,.12);border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;z-index:7">
            <div style="width:48px;height:48px;border-radius:999px;background:{{knobColor}}"></div>
          </div>
        </sc-if>
      </div>
    </sc-if>

    <sc-if value="{{isMouth}}" hint-placeholder-val="{{false}}">
      <div class="scroll" style="position:absolute;inset:0;padding:24px 16px 110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
        <span class="micro">Mouthfeel <span style="font-weight:600;text-transform:none;letter-spacing:0">(up to 2)</span></span>
        <div style="width:100%;display:flex;flex-wrap:wrap;justify-content:center;gap:10px">
          <sc-for list="{{cata}}" as="o" hint-placeholder-count="5">
            <button style="width:calc(50% - 5px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:64px;border-radius:16px;border:.5px solid {{o.border}};background:{{o.bg}};padding:12px 10px;text-align:center" onClick="{{o.pick}}">
              <span style="font-size:14px;font-weight:700">{{o.name}}</span>
              <sc-if value="{{o.hasSub}}" hint-placeholder-val="{{false}}"><span style="font-size:11.5px;font-weight:500;color:var(--muted)">{{o.sub}}</span></sc-if>
            </button>
          </sc-for>
        </div>
      </div>
    </sc-if>

    <!-- descriptors sheet: one row when collapsed, a bottom sheet when open -->
    <sc-if value="{{trayClosed}}" hint-placeholder-val="{{true}}">
      <button style="position:absolute;left:0;right:0;bottom:0;height:86px;padding:0 12px 34px 16px;display:flex;align-items:center;gap:10px;border:0;border-top:.5px solid var(--border);background:var(--card-solid);color:var(--fg);z-index:8;text-align:left" onClick="{{toggleTray}}" aria-expanded="false">
        <span class="micro" style="flex:none">Descriptors · {{count}}</span>
        <span class="xscroll" style="flex:1;min-width:0;display:flex;gap:6px">
          <sc-for list="{{picks}}" as="p" hint-placeholder-count="2">
            <span style="flex:none;border-radius:999px;border:.5px solid var(--border);background:var(--card);padding:5px 10px;font-size:11.5px;font-weight:600;white-space:nowrap">{{p.name}}</span>
          </sc-for>
          <sc-if value="{{noPicks}}" hint-placeholder-val="{{false}}"><span style="font-size:11.5px;color:var(--muted);white-space:nowrap">{{emptyHint}}</span></sc-if>
        </span>
        <span style="flex:none;color:var(--muted)">${CHEV_UP}</span>
      </button>
    </sc-if>
    <sc-if value="{{trayOpen}}" hint-placeholder-val="{{false}}">
      <div style="position:absolute;left:0;right:0;bottom:0;max-height:334px;display:flex;flex-direction:column;border-top:.5px solid var(--border);border-radius:20px 20px 0 0;background:var(--card-solid);padding:0 16px 34px;z-index:8;box-shadow:0 -10px 40px rgba(0,0,0,.12)">
        <button style="flex:none;height:52px;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--fg);text-align:left;padding:0" onClick="{{toggleTray}}" aria-expanded="true">
          <span class="micro">Descriptors · {{count}}</span>
          <span style="flex:1;font-size:10.5px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{groupSub}} · shared across sections</span>
          <span style="flex:none;color:var(--muted)">${CHEV_DOWN}</span>
        </button>
        <div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding-bottom:4px">
          <sc-if value="{{isFlavor}}" hint-placeholder-val="{{false}}">
            <div style="display:flex;flex-direction:column;gap:8px">
              <span class="micro">Main tastes <span style="font-weight:600;text-transform:none;letter-spacing:0">(up to 2)</span></span>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <sc-for list="{{tastes}}" as="t" hint-placeholder-count="5">
                  <button style="height:36px;border-radius:999px;border:.5px solid {{t.border}};background:{{t.bg}};color:{{t.color}};padding:0 13px;font-size:12.5px;font-weight:600" onClick="{{t.pick}}">{{t.name}}</button>
                </sc-for>
              </div>
            </div>
          </sc-if>
          <sc-if value="{{isWheel}}" hint-placeholder-val="{{true}}">
            <div style="display:flex;flex-direction:column;gap:8px">
              <span class="micro">Descriptors</span>
              <div style="display:flex;flex-wrap:wrap;gap:6px;min-height:36px">
                <sc-if value="{{noPicks}}" hint-placeholder-val="{{false}}"><span style="font-size:12px;color:var(--muted)">Tap a family on the wheel, then tap the notes you find.</span></sc-if>
                <sc-for list="{{picks}}" as="p" hint-placeholder-count="2">
                  <button aria-label="{{p.aria}}" style="display:inline-flex;align-items:center;gap:6px;height:36px;border-radius:999px;border:.5px solid var(--border);background:var(--card);padding:0 12px;font-size:11.5px;font-weight:600" onClick="{{p.remove}}">{{p.name}}<span style="color:var(--muted)">{{p.crumb}}</span></button>
                </sc-for>
              </div>
              <p style="margin:0;font-size:11.5px;line-height:1.6;color:var(--muted)"><b style="color:var(--fg)">Official form auto-fill</b> · {{autofill}}</p>
            </div>
          </sc-if>
          <label style="display:flex;flex-direction:column;gap:6px" class="micro">Descriptors — freely elicited (off-wheel)
            <input placeholder="e.g. &quot;dried tomato&quot; — notes the wheel does not cover" style="height:44px;border-radius:14px;border:.5px solid var(--border);background:var(--card);padding:0 14px;font-size:14px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--fg);outline:none">
          </label>
          <sc-if value="{{hasToast}}" hint-placeholder-val="{{false}}"><div class="fadein" style="align-self:center;border-radius:12px;border:.5px solid var(--border);background:var(--card);padding:10px 14px;font-size:12.5px;font-weight:600">{{toast}}</div></sc-if>
        </div>
      </div>
    </sc-if>
  </div>
</div>
`
  const meta = Object.fromEntries(D.nodes.map((n) => [n.id, { k: n.key, n: n.name, f: n.family, p: n.path, c: n.fill, b: n.cata.boxes, fr: n.cata.free }]))
  const st = (x) => ({ t: x.transform, s: x.scale, fs: [x.fs.r1, x.fs.r2, x.fs.r3], v: x.visible.map((k) => D.nodes.find((n) => n.key === k).id) })
  const cams = { rest: { col: st(D.rest.col), exp: st(D.rest.exp) } }
  for (const [f, v] of Object.entries(D.fly)) cams[f] = { col: st(v.col), exp: st(v.exp) }
  const cams22 = { rest: cams.rest }
  for (const [f, v] of Object.entries(D.fly22)) cams22[f] = { col: st(v.col), exp: st(v.exp) }
  const famColor = Object.fromEntries(D.families.map((f) => [f.name, f.color]))
  const famLabel = Object.fromEntries(D.nodes.filter((n) => n.ring === 1).map((n) => [n.family, n.labelFill]))
  const idOf = (key) => D.nodes.find((n) => n.key === key).id
  const seeds = {
    aroma: [idOf('Floral>Floral>Jasmine')],
    flavor: [idOf('Fruity>Berry>Raspberry'), idOf('Sweet>Brown Sugar>Honey')],
  }
  const logic = `const NODE = ${JSON.stringify(meta)}
const CAM_FIT = ${JSON.stringify(cams)}
const CAM_FLOOR = ${JSON.stringify(cams22)}
const FAM = ${JSON.stringify(famColor)}
const FAM_LABEL = ${JSON.stringify(famLabel)}
const FAMILIES = ${JSON.stringify(D.families.map((f) => f.name))}
const ALL = Object.keys(NODE)
const SEED = ${JSON.stringify(seeds)}
const ACCENT = { aroma: '#6b8e23', flavor: '#b07946', mouthfeel: '#445763' }
const SUB = { aroma: 'Fragrance + Aroma (orthonasal)', flavor: 'Flavor & Aftertaste · retronasal', mouthfeel: 'Texture & weight' }
const TASTES = ${JSON.stringify(D.MAIN_TASTES)}
const MOUTH = ${JSON.stringify(D.MOUTH_CATA)}
const soft = (h) => 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',.14)'
class Component extends DCLogic {
  S() {
    const p = this.props
    const init = {
      group: p.group || 'aroma',
      family: p.framed && p.framed !== 'none' ? p.framed : null,
      trayOpen: !!p.trayOpen,
      stick: p.stick !== false,
      picks: { aroma: SEED.aroma.slice(), flavor: SEED.flavor.slice() },
      tastes: ['Sweet'],
      cata: ['Smooth'],
      toast: null,
    }
    return Object.assign(init, (this.state && this.state.s) || {})
  }
  set(patch) { this.setState({ s: Object.assign(this.S(), patch) }) }
  flash(msg) { this.set({ toast: msg }); clearTimeout(this._t); this._t = setTimeout(() => this.set({ toast: null }), 2500) }
  tap(id) {
    const n = NODE[id], s = this.S()
    if (s.family !== n.f) { this.set({ family: n.f }); return }
    if (s.group === 'mouthfeel') return
    const list = s.picks[s.group].slice()
    const i = list.indexOf(id)
    let removed = null
    if (i >= 0) list.splice(i, 1)
    else { if (list.length >= 5) removed = list.shift(); list.push(id) }
    const picks = Object.assign({}, s.picks); picks[s.group] = list
    this.set({ picks })
    if (removed) this.flash('Cap of 5 reached — replaced "' + NODE[removed].n + '"')
  }
  toggleIn(listName, item, cap) {
    const s = this.S(); const list = s[listName].slice(); const i = list.indexOf(item)
    if (i >= 0) list.splice(i, 1); else { if (list.length >= cap) list.shift(); list.push(item) }
    const patch = {}; patch[listName] = list; this.set(patch)
  }
  renderVals() {
    const s = this.S()
    const accent = ACCENT[s.group]
    const isWheel = s.group !== 'mouthfeel'
    const CAM = this.props.zoomFloor === '2.2x floor' ? CAM_FLOOR : CAM_FIT
    const camState = (s.family ? CAM[s.family] : CAM.rest)[s.trayOpen ? 'exp' : 'col']
    const vis = new Set(camState.v)
    const picked = new Set(isWheel ? s.picks[s.group] : [])
    const lv = {}, pc = {}, pk = {}
    for (const id of ALL) { lv[id] = vis.has(id) ? 'inline' : 'none'; pc[id] = picked.has(id) ? 'is-picked' : ''; pk[id] = () => this.tap(id) }
    const picks = isWheel ? s.picks[s.group].map((id) => ({
      name: NODE[id].n, crumb: NODE[id].p.slice(0, -1).join(' › '), aria: 'Remove ' + NODE[id].n,
      remove: () => { const list = s.picks[s.group].filter((x) => x !== id); const p = Object.assign({}, s.picks); p[s.group] = list; this.set({ picks: p }) },
    })) : []
    const boxes = [], frees = []
    if (isWheel) for (const id of s.picks[s.group]) { for (const b of NODE[id].b) if (!boxes.includes(b)) boxes.push(b); if (NODE[id].fr) frees.push(NODE[id].fr) }
    const count = isWheel ? s.picks[s.group].length + (s.group === 'flavor' ? s.tastes.length : 0) : s.cata.length
    const tabLabel = (g, label) => { const n = g === 'aroma' ? s.picks.aroma.length : g === 'flavor' ? s.picks.flavor.length + s.tastes.length : s.cata.length; return label + (n > 0 ? ' · ' + n : '') }
    return {
      themeCls: this.props.dark ? 'dark' : '',
      accentSoft: soft(accent),
      tabs: [['aroma', 'Aroma'], ['flavor', 'Flavor'], ['mouthfeel', 'Mouthfeel']].map(([g, label]) => {
        const on = g === s.group
        return { label: tabLabel(g, label), bg: on ? ACCENT[g] : 'transparent', color: on ? '#fff' : 'var(--muted)', border: on ? 'transparent' : 'var(--border)', pick: () => this.set({ group: g }) }
      }),
      isWheel, isMouth: !isWheel, isFlavor: s.group === 'flavor',
      cam: camState.t, fs1: camState.fs[0], fs2: camState.fs[1], fs3: camState.fs[2],
      lv, pc, pk,
      zoomOut: () => this.set({ family: null }),
      showBack: !!s.family, backLabel: s.family || '',
      showHome: !!s.family && camState.s > 1.05,
      count,
      wheelCount: isWheel ? s.picks[s.group].length : 0,
      rail: FAMILIES.map((f) => {
        const on = s.family === f
        return { name: f, dot: on ? FAM_LABEL[f] : FAM[f], bg: on ? FAM[f] : 'rgba(255,255,255,.08)', border: on ? 'transparent' : 'rgba(255,255,255,.25)', color: on ? FAM_LABEL[f] : '#f3f0e8', pick: () => this.set({ family: on ? null : f }) }
      }),
      stickVisible: isWheel && s.stick && !s.trayOpen,
      stickSideCss: (this.props.stickSide === 'left') ? 'left:24px' : 'right:24px',
      knobColor: s.family ? FAM[s.family] : 'rgba(255,255,255,.5)',
      stickBg: s.stick ? soft(accent) : 'transparent', stickBorder: s.stick ? accent : 'var(--border)', stickColor: s.stick ? accent : 'var(--muted)',
      toggleStick: () => this.set({ stick: !s.stick }),
      trayOpen: s.trayOpen, trayClosed: !s.trayOpen,
      toggleTray: () => this.set({ trayOpen: !s.trayOpen }),
      picks, noPicks: isWheel ? picks.length === 0 : s.cata.length === 0,
      emptyHint: isWheel ? 'Tap a family, then the notes you find' : 'Pick up to two',
      groupSub: SUB[s.group],
      autofill: (boxes.length ? boxes.join(', ') : '—') + (frees.length ? ' · precise notes: ' + frees.join(', ') : ''),
      tastes: TASTES.map((t) => { const on = s.tastes.includes(t); return { name: t, bg: on ? accent : 'transparent', color: on ? '#fff' : 'var(--muted)', border: on ? 'transparent' : 'var(--border)', pick: () => this.toggleIn('tastes', t, 2) } }),
      cata: MOUTH.map((o) => { const on = s.cata.includes(o.name); return { name: o.name, sub: o.sub, hasSub: !!o.sub, bg: on ? soft(accent) : 'transparent', border: on ? accent : 'var(--border)', pick: () => this.toggleIn('cata', o.name, 2) } }),
      hasToast: !!s.toast, toast: s.toast || '',
    }
  }
}`
  const fams = ['none', ...D.families.map((f) => f.name)]
  const props = `{${darkProp},"group":{"editor":"enum","options":["aroma","flavor","mouthfeel"],"default":"${group}","section":"State"},"framed":{"editor":"enum","options":${JSON.stringify(fams)},"default":"${framed}","section":"State"},"trayOpen":{"editor":"boolean","default":${trayOpen},"section":"State"},"stick":{"editor":"boolean","default":${stick},"section":"Thumbstick"},"stickSide":{"editor":"enum","options":["right","left"],"default":"right","section":"Thumbstick"},"zoomFloor":{"editor":"enum","options":["as built","2.2x floor"],"default":"as built","section":"Proposal"},${preview}}`
  return head(title, WHEEL_CSS) + content + tail(props, logic)
}

/* ------------------------------------------------------------- 5. Score */
function buildScore() {
  const accent = BAND_EXCELLENT
  const values = [7, 7, 6, 6, 7, 6, 6, 6]   // Σ = 51 → 0.65625×51 + 52.75 = 86.22 → 86.25 (Excellent)
  const cards = SECTIONS.map((s, i) => `<button style="display:flex;flex-direction:column;align-items:center;gap:2px;border-radius:16px;border:.5px solid var(--border);background:var(--card);padding:10px 8px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">${s.label}</span><span style="font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;color:${IMPRESSION_COLORS[values[i] - 1]}">${values[i]}</span></button>`).join('')
  const code = (t) => `<code style="border-radius:6px;border:.5px solid var(--border);background:var(--card);padding:1px 6px;font-weight:600;color:var(--fg);font-family:inherit">${t}</code>`
  const content = `
    <div style="position:relative;width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;border-radius:20px;padding:20px 0 8px;background:radial-gradient(circle at 50% 40%, ${hex2rgba(accent, 0.16)}, transparent 65%)">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:var(--muted);text-align:center">SCA 2024 Coffee Value Assessment</div>
      <div style="font-size:90px;font-weight:800;line-height:.9;letter-spacing:-6px;font-variant-numeric:tabular-nums;color:${accent}">86.25</div>
      <div style="border-radius:18px;padding:8px 26px;font-size:20px;font-weight:800;color:#fff;background:${accent}">Excellent</div>
      <div style="margin-top:6px;font-size:13px;font-weight:500;color:var(--muted)">${LOT}</div>
    </div>
    <div style="width:100%;display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px">
      ${cards}
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;border-radius:16px;border:.5px solid var(--border);background:var(--card);padding:10px 8px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Penalty</span><span style="font-size:18px;font-weight:800;font-variant-numeric:tabular-nums">0</span></div>
    </div>
    <div style="max-width:340px;text-align:center;font-size:11.5px;line-height:1.9;color:var(--muted)">S = 0.65625 × Σ(8 sections) + 52.75 − 2·non-uniform − 4·defective<br>${code('0.65625 × 51')} + ${code('52.75')} − ${code('2×0')} − ${code('4×0')} = ${code('86.25')}</div>`
  return head('Score', '') + shell({ accent, step: 10, done: doneThrough(10), pill: SCORE_PILL, nextLabel: 'Compare the panel', strip: staticStrip(accent, ['done', 'done', 'done']) }, content) + tail(`{${darkProp},${preview}}`, THEME_LOGIC)
}

/* ------------------------------------------------------------- 6. Panel */
function buildPanel() {
  const accent = BAND_EXCELLENT
  const row = (name, tags, score, dashed = false) => `<li style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;border-radius:14px;border:.5px ${dashed ? 'dashed' : 'solid'} var(--border);padding:10px 16px"><span style="display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px;font-size:14px;min-width:0">${name}${tags.map((t) => `<span style="font-size:12px;color:var(--muted)">${t}</span>`).join('')}</span><span style="flex:none;font-size:${dashed ? 12 : 14}px;font-weight:${dashed ? 400 : 600};font-variant-numeric:tabular-nums;color:${dashed ? 'var(--muted)' : 'var(--fg)'};text-align:right">${score}</span></li>`
  const content = `
    <div style="width:100%;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:baseline;justify-content:space-between"><h2 style="margin:0;font-size:14px;font-weight:600">Panel · 3 cuppers</h2><span style="font-size:12px;color:var(--muted)">${LOT}</span></div>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">
        ${row('<span style="font-weight:600">[Second cupper]</span>', ['furthest from the mean'], '88.75')}
        ${row('<span style="font-weight:600">Daniel Wolthers</span>', ['you'], '86.25')}
        ${row('<span>[Third cupper]</span>', ['authoritative'], '85.50')}
        ${row('<span>[Guest name]</span>', ['guest'], 'not recorded — see the paper card', true)}
      </ul>
      <div style="display:flex;flex-wrap:wrap;gap:4px 24px;font-size:12px;color:var(--muted)"><span>mean 86.83</span><span>spread 3.25</span><span>threshold 3</span></div>
      <p style="margin:0;font-size:14px;line-height:1.5">This panel is wider than the 3-point threshold. Talk it through before certifying.</p>
    </div>`
  return head('Panel', '') + shell({ accent, step: 11, done: doneThrough(11), pill: SCORE_PILL, nextLabel: 'Next', strip: staticStrip(accent, ['done', 'done', 'done']) }, content) + tail(`{${darkProp},${preview}}`, THEME_LOGIC)
}

/* ----------------------------------------------------------- 7. Certify */
function buildCertify() {
  const accent = BAND_EXCELLENT
  const content = `
    <div style="text-align:center">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:var(--muted)">Certify this lot</div>
      <div style="margin-top:4px;font-size:13px;font-weight:600">${LOT}</div>
    </div>
    <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;border-radius:20px;border:.5px solid var(--border);background:var(--card);padding:28px 24px">
      <div style="font-size:48px;font-weight:800;line-height:1;letter-spacing:-1px;font-variant-numeric:tabular-nums">86.25</div>
      <div style="border-radius:14px;padding:7px 16px;font-size:13px;font-weight:700;color:#fff;background:#22c55e">Passes the 85 pass mark</div>
    </div>
    <sc-if value="{{idle}}" hint-placeholder-val="{{true}}">
      <div style="width:100%;display:flex;flex-direction:column;gap:10px">
        <button style="height:48px;border-radius:16px;border:0;background:${accent};color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 18px ${soft(accent)}" onClick="{{certify}}">{{certifyLabel}}</button>
        <button style="height:48px;border-radius:16px;border:.5px solid var(--border);background:transparent;font-size:14px;font-weight:700;color:var(--muted)" onClick="{{openOverride}}">Override</button>
      </div>
    </sc-if>
    <sc-if value="{{overriding}}" hint-placeholder-val="{{false}}">
      <div class="fadein" style="width:100%;display:flex;flex-direction:column;gap:12px;border-radius:20px;border:.5px solid var(--border);background:var(--card);padding:16px;text-align:left">
        <label class="micro" style="display:flex;flex-direction:column;gap:6px">Override comment — required
          <textarea rows="3" placeholder="Why does this decision override the cup's own reading?" style="border-radius:14px;border:.5px solid {{commentBorder}};background:var(--bg);padding:12px 14px;font-size:14px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--fg);outline:none;resize:vertical" onChange="{{onComment}}"></textarea>
        </label>
        <sc-if value="{{commentError}}" hint-placeholder-val="{{false}}"><p style="margin:0;font-size:12.5px;font-weight:600;color:#ef4444">An override comment is required.</p></sc-if>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button style="height:48px;border-radius:16px;border:0;background:#22c55e;color:#fff;font-size:14px;font-weight:700" onClick="{{approve}}">{{approveLabel}}</button>
          <button style="height:48px;border-radius:16px;border:0;background:#ef4444;color:#fff;font-size:14px;font-weight:700" onClick="{{reject}}">{{rejectLabel}}</button>
          <button style="height:44px;border-radius:16px;border:.5px solid var(--border);background:transparent;font-size:14px;font-weight:700;color:var(--muted)" onClick="{{cancel}}">Cancel</button>
        </div>
      </div>
    </sc-if>
    <sc-if value="{{decided}}" hint-placeholder-val="{{false}}">
      <div class="fadein" style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <p style="margin:0;font-size:12.5px;color:var(--muted)">This lot was already {{decision}} — there is no need to cup it again.</p>
        <div style="width:100%;display:flex;flex-direction:column;gap:10px">
          <button style="height:48px;border-radius:16px;border:0;background:${accent};color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 18px ${soft(accent)}">View certificate</button>
          <button style="height:48px;border-radius:16px;border:.5px solid var(--border);background:transparent;font-size:14px;font-weight:500;color:var(--muted)" onClick="{{openOverride}}">Override</button>
        </div>
      </div>
    </sc-if>`
  const logic = `class Component extends DCLogic {
  S() { return Object.assign({ mode: 'idle', pending: null, comment: '', error: false, decision: null }, this.state || {}) }
  finish(decision) { clearTimeout(this._t); this._t = setTimeout(() => this.setState({ mode: 'decided', pending: null, decision, comment: '', error: false }), 900) }
  renderVals() {
    const s = this.S()
    return {
      themeCls: this.props.dark ? 'dark' : '',
      idle: s.mode === 'idle', overriding: s.mode === 'override', decided: s.mode === 'decided',
      decision: s.decision || '',
      certifyLabel: s.pending === 'certify' ? 'Certifying…' : 'Certify',
      approveLabel: s.pending === 'approve' ? 'Approving…' : 'Approve this lot',
      rejectLabel: s.pending === 'reject' ? 'Rejecting…' : 'Reject this lot',
      certify: () => { if (s.pending) return; this.setState({ pending: 'certify' }); this.finish('approved') },
      openOverride: () => this.setState({ mode: 'override', error: false }),
      cancel: () => this.setState({ mode: s.decision ? 'decided' : 'idle', comment: '', error: false }),
      onComment: (e) => this.setState({ comment: e.target.value, error: false }),
      commentBorder: s.error ? '#ef4444' : 'var(--border)',
      commentError: s.error,
      approve: () => { if (s.pending) return; if (!s.comment.trim()) { this.setState({ error: true }); return } this.setState({ pending: 'approve' }); this.finish('approved') },
      reject: () => { if (s.pending) return; if (!s.comment.trim()) { this.setState({ error: true }); return } this.setState({ pending: 'reject' }); this.finish('rejected') },
    }
  }
}`
  return head('Certify', '') + shell({ accent, step: 12, done: doneThrough(12), pill: SCORE_PILL, nextLabel: 'Next', nextDisabled: true, strip: staticStrip(accent, ['done', 'done', 'done']) }, content) + tail(`{${darkProp},${preview}}`, logic)
}

/* ------------------------------------------------------------------ write */
const files = {
  'Roast.dc.html': buildRoast(),
  'Main.dc.html': buildSection(),
  'Wheel.dc.html': buildWheel({ title: 'Describe — wheel at rest', group: 'aroma', framed: 'none', trayOpen: false, stick: true }),
  'WheelFramed.dc.html': buildWheel({ title: 'Describe — Fruity framed', group: 'flavor', framed: 'Fruity', trayOpen: false, stick: true }),
  'WheelSheet.dc.html': buildWheel({ title: 'Describe — sheet open', group: 'flavor', framed: 'Fruity', trayOpen: true, stick: true }),
  'Mouthfeel.dc.html': buildWheel({ title: 'Describe — Mouthfeel', group: 'mouthfeel', framed: 'none', trayOpen: false, stick: true }),
  'Cups.dc.html': buildCups(),
  'Score.dc.html': buildScore(),
  'Panel.dc.html': buildPanel(),
  'Certify.dc.html': buildCertify(),
}
for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(here, name), html)
  console.log(name.padEnd(22), (html.length / 1024).toFixed(1) + ' KB')
}

const X = 470, Y2 = 964
const canvas = {
  artboards: [
    { file: 'Roast.dc.html', title: '1 · Roast', x: 0, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'Main.dc.html', title: '2 · Section (Aftertaste)', x: X, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'Wheel.dc.html', title: '3 · Describe — at rest', x: X * 2, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'WheelFramed.dc.html', title: '4 · Describe — Fruity framed', x: X * 3, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'WheelSheet.dc.html', title: '5 · Describe — sheet open', x: X * 4, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'Mouthfeel.dc.html', title: '6 · Describe — Mouthfeel', x: X * 5, y: 0, w: 390, h: 844, is_interactive: true },
    { file: 'Cups.dc.html', title: '7 · Cups & uniformity', x: 0, y: Y2, w: 390, h: 844, is_interactive: true },
    { file: 'Score.dc.html', title: '8 · Score', x: X, y: Y2, w: 390, h: 844, is_interactive: false },
    { file: 'Panel.dc.html', title: '9 · Panel', x: X * 2, y: Y2, w: 390, h: 844, is_interactive: false },
    { file: 'Certify.dc.html', title: '10 · Certify', x: X * 3, y: Y2, w: 390, h: 844, is_interactive: true },
  ],
  annotations: [
    { id: 'shell-note', x: X * 4, y: Y2, w: 420, text: 'Phone shell — what moved and why\n\n• STEP-MAJOR (SCA-102 §7: "step 1 is done for all the coffees on the table, next step 2, and finally step 3"). The section is the page; the sample strip under the ribbon switches lots and shows which are rated for this section. Overall lands last for every lot. Needs one hook change: useCvaSession keeps a step per sample today.\n• Score pill counts sections (4 / 8) until all eight are in. The number it shows today is the formula over a partial sum — 69.75 is the two-way-table value for Σ=26 and means nothing until the reveal.\n• Header is one 52 px row: back chevron, step name, pill. The W mark, breadcrumb and "SCA 2024 Value Assessment" wrapped to three rows at 390 px.\n• Progress ribbon keeps the bars (13 now, with Cups) plus the current/next step written under it — on the phone today the labels are hidden.\n• Footer pinned above the home indicator.' },
    { id: 'scale-note', x: X * 4, y: Y2 + 380, w: 420, text: 'Section screen — the redraw\n\n• Impression: ONE row of nine, as on the affective form — tap anywhere or drag along it, snaps to a segment; the selected one pops with the ring; the rubric reads out large (SCA-104 §5.2: use the scale intuitively).\n• Cooled: arm it and the next tap places a SECOND mark on the same track — the initial keeps a dashed outline, the arrow shows the direction, and the readout writes the FINAL (§5.2: second bubble, arrow, final box; both kept). Same model as production (impression + impression_final), just drawn properly.\n• Intensity: a continuous 0–15 track with the form\'s ticks and LOW/MEDIUM/HIGH; tap or drag, nearest integer recorded (SCA-103 §6.2: "a tick anywhere along the scale"). Cooled also adds a second mark here (§6.2) — that needs a new intensity_final field.\n• Describe names the box this section feeds and its remaining budget ("Flavor & Aftertaste 2 / 5 · tastes 1 / 2"): one list shared by both sections (§6.3.2), not a per-section count.\n• Everything above the fold at 390×844, including the note.' },
    { id: 'cups-note', x: X * 5, y: Y2, w: 420, text: 'Cups & uniformity — new step (your June spec §3.5, never built)\n\nEvery CVA score today has u = d = 0: types/cva.ts defines cups, nothing sets or renders it.\n\n• Five cups; tap once = non-uniform (−2), twice = defective (−4), third tap clears.\n• SCA-104 §5.4.1: a defect needs BOTH the cups and the type (Moldy / Phenolic / Potato) — until the type is picked the penalty line says "not counted".\n• §5.4.2: a defective cup counts as non-uniform too, unless all five are evenly defective.\n• Sits after Overall (§4.4: uniformity is assessed in the liquoring step) and before the reveal; the pill reads 8 / 8 so the score is not spoiled.\n\nStill open, not drawn: SCA-102 §7.2 — a combined-form session should run fewer coffees; that is a session-setup warning.' },
    { id: 'wheel-note', x: X * 5, y: Y2 + 470, w: 420, text: 'Describe overlay — unchanged this round. See the earlier notes: stick toggle moved to the top bar (ends the tray collision), tray → bottom sheet, family rail (at rest on a phone the production label rule hides almost every family name), Fruity frames at 1.35× (zoomFloor chip compares a 2.2× floor), "Flavor & Aftertaste" → "Flavor" in the tab, picks counter contrast.' },
  ],
  launch: { view: 'canvas' },
}
writeFileSync(join(here, 'canvas.json'), JSON.stringify(canvas, null, 2))
console.log('canvas.json written')
