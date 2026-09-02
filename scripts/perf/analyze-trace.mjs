// Summarise a Chrome trace of the wheel harness. usage: node analyze-trace.mjs trace.json
import fs from 'node:fs'
const file = process.argv[2]
const ev = JSON.parse(fs.readFileSync(file, 'utf8')).traceEvents
const marks = ev.filter((e) => (e.cat || '').includes('blink.user_timing') && /-(start|end)$/.test(e.name))
const t0 = Math.min(...marks.filter((m) => /-start$/.test(m.name)).map((m) => m.ts))
const t1 = Math.max(...marks.filter((m) => /-end$/.test(m.name)).map((m) => m.ts))
const win = (e) => e.ts >= t0 && e.ts <= t1
// renderer main thread = CrRendererMain of the pid that owns the Layout events
const lay0 = ev.find((e) => e.name === 'Layout' && e.ph === 'X' && win(e))
const rpid = lay0.pid
const mainTid = ev.find((e) => e.name === 'thread_name' && e.pid === rpid && e.args?.name === 'CrRendererMain').tid
const onMain = (e) => e.pid === rpid && e.tid === mainTid
const X = ev.filter((e) => e.ph === 'X' && win(e))
const sum = (pred) => X.filter(pred).reduce((s, e) => s + e.dur, 0) / 1000
const cnt = (pred) => X.filter(pred).length
const ms = (v) => +v.toFixed(1)
// frames from the renderer's PipelineReporter
const pipe = ev.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.pid === rpid && win(e)).sort((a, b) => a.ts - b.ts)
const states = {}; let highLat = 0
for (const p of pipe) { const s = p.args?.frame_reporter?.state || '?'; states[s] = (states[s] || 0) + 1; if (p.args?.frame_reporter?.has_high_latency) highLat++ }
const gapsAll = [], gapsMotion = []
for (let i = 1; i < pipe.length; i++) { const g = (pipe[i].ts - pipe[i - 1].ts) / 1000; if (g <= 400) gapsAll.push(g); if (g <= 100) gapsMotion.push(g) }
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return ms(s[Math.min(s.length - 1, Math.floor(p * s.length))]) }
// main-thread frame = BeginMainFrame; its duration is the true per-frame main cost
const bmf = X.filter((e) => onMain(e) && e.name === 'ProxyMain::BeginMainFrame').map((e) => e.dur / 1000)
const bmfSorted = [...bmf].sort((a, b) => a - b)
const nFrames = Math.max(gapsMotion.length, 1)
const cat = (names, thread = onMain) => ({ total_ms: ms(sum((e) => thread(e) && names.includes(e.name))), events: cnt((e) => thread(e) && names.includes(e.name)) })
const cats = {
  Layout: cat(['Layout']),
  Style: cat(['UpdateLayoutTree']),
  PrePaint_Layerize: cat(['PrePaint', 'Layerize', 'UpdateLayerTree']),
  Paint: cat(['Paint']),
  Script: cat(['FunctionCall', 'TimerFire', 'FireAnimationFrame']),
  HitTest: cat(['HitTest']),
  GC: cat(['MajorGC', 'MinorGC']),
}
const rasterThreads = (e) => e.pid === rpid && e.tid !== mainTid
const raster = cat(['RasterTask', 'RasterizerTaskImpl::RunOnWorkerThread'], rasterThreads)
const imageDecode = cat(['Decode Image', 'ImageDecodeTask'], rasterThreads)
// forced layouts: Layout carrying a JS stack, excluding the harness's own getBoundingClientRect reads
const forced = X.filter((e) => onMain(e) && e.name === 'Layout' && e.args?.beginData?.stackTrace?.length && !String(e.args.beginData.stackTrace[0]?.url || '').startsWith('pptr:'))
const forcedFns = {}
for (const f of forced) { const k = f.args.beginData.stackTrace[0].functionName || '(anon)'; forcedFns[k] = (forcedFns[k] || 0) + 1 }
const tasks = X.filter((e) => onMain(e) && e.name === 'RunTask').map((e) => e.dur / 1000)
const long = tasks.filter((d) => d > 50)
const windowMs = (t1 - t0) / 1000
const out = {
  file, window_ms: Math.round(windowMs),
  frames: {
    pipeline_frames: pipe.length, states, high_latency: highLat,
    motion_frames: gapsMotion.length, motion_p50_ms: pct(gapsMotion, 0.5), motion_p95_ms: pct(gapsMotion, 0.95), motion_max_ms: pct(gapsMotion, 1),
    all_gaps_p95_ms: pct(gapsAll, 0.95),
    fps_in_motion: gapsMotion.length ? ms(1000 / (gapsMotion.reduce((a, b) => a + b, 0) / gapsMotion.length)) : null,
  },
  main_frame: { begin_main_frames: bmf.length, total_ms: ms(bmf.reduce((a, b) => a + b, 0)), p50_ms: pct(bmfSorted, 0.5), p95_ms: pct(bmfSorted, 0.95), max_ms: pct(bmfSorted, 1) },
  main_busy_pct: Math.round((tasks.reduce((a, b) => a + b, 0) / windowMs) * 100),
  long_tasks: { count: long.length, max_ms: long.length ? ms(Math.max(...long)) : 0 },
  forced_layouts: { count: forced.length, total_ms: ms(forced.reduce((s, e) => s + e.dur, 0) / 1000), by_function: forcedFns },
  per_motion_frame_ms: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, ms(v.total_ms / nFrames)])),
  totals: { ...cats, Raster_workers: raster, ImageDecode: imageDecode },
}
console.log(JSON.stringify(out, null, 2))
