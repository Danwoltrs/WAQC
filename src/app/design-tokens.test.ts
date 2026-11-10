import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
const ui = (file: string) => read(`src/components/ui/${file}`)

const css = read('src/app/globals.css')
const tailwind = read('tailwind.config.ts')

/** Text between `selector {` and its closing brace, searched from `from`. */
function block(source: string, selector: string, from = 0): string {
  const start = source.indexOf(`${selector} {`, from)
  if (start === -1) throw new Error(`No ${selector} block found`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

const layerBase = css.indexOf('@layer base')
// The token block: first `:root { ... }` inside `@layer base`.
const rootBlock = block(css, ':root', layerBase)
// The dark token block: first `.dark { ... }` inside `@layer base`.
const darkBlock = block(css, '.dark', layerBase)
// The portal pin: `.portal-light { ... }` inside `@layer base`, after `.dark`.
const portalBlock = block(css, '.portal-light', layerBase)
const shell = read('src/components/portal/portal-shell.tsx')

/** `[name, value]` for every `--x: value;` line except `--radius-*`. */
function colourTokens(source: string): [string, string][] {
  return [...source.matchAll(/(--(?!radius)[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
}

describe('radius tokens', () => {
  it('defines the three levels in :root', () => {
    expect(rootBlock).toContain('--radius-container: 10px')
    expect(rootBlock).toContain('--radius-control: 6px')
    expect(rootBlock).toContain('--radius-badge: 4px')
    expect(rootBlock).not.toMatch(/--radius:\s*20px/)
  })
  it('maps Tailwind lg/md/sm onto them', () => {
    expect(tailwind).toMatch(/lg:\s*'var\(--radius-container\)'/)
    expect(tailwind).toMatch(/md:\s*'var\(--radius-control\)'/)
    expect(tailwind).toMatch(/sm:\s*'var\(--radius-badge\)'/)
  })
  it('has no .lab-card rule', () => {
    expect(css).not.toContain('.lab-card')
  })
  it.each([
    ['dropdown-menu.tsx', 'rounded-lg'],
    ['context-menu.tsx', 'rounded-lg'],
    ['popover.tsx', 'rounded-lg'],
    ['command.tsx', 'rounded-lg'],
    ['toast.tsx', 'rounded-lg'],
    ['select.tsx', 'rounded-lg'],
  ])('%s content is a 10px container', (file, cls) => {
    expect(ui(file)).toContain(cls)
  })
  it('no menu or select container keeps rounded-md', () => {
    for (const f of ['dropdown-menu.tsx', 'context-menu.tsx', 'select.tsx']) {
      expect(ui(f)).not.toContain('rounded-md border bg-popover')
    }
  })
  it('badges are 4px', () => {
    expect(ui('badge.tsx')).toContain('rounded-sm')
    expect(ui('badge.tsx')).not.toContain('rounded-full')
  })
  it('checkboxes are 3px', () => {
    expect(ui('checkbox.tsx')).toContain('rounded-[3px]')
  })
})

describe('primary green', () => {
  it('is #15663f in light mode', () => {
    expect(rootBlock).toMatch(/--primary:\s*151 66% 24%/)
    expect(rootBlock).toMatch(/--primary-foreground:\s*0 0% 98%/)
  })
  it('is a light green with dark text in dark mode', () => {
    expect(darkBlock).toMatch(/--primary:\s*151 50% 55%/)
    expect(darkBlock).toMatch(/--primary-foreground:\s*0 0% 9%/)
  })
  it('keeps the focus ring neutral', () => {
    expect(rootBlock).toMatch(/--ring:\s*0 0% 3\.9%/)
    expect(darkBlock).toMatch(/--ring:\s*0 0% 83\.1%/)
  })
})

describe('portal stays light', () => {
  it('restates every light colour token', () => {
    const tokens = colourTokens(rootBlock)
    expect(tokens.length).toBeGreaterThan(15)
    for (const [name, value] of tokens) expect(portalBlock).toContain(`${name}: ${value}`)
  })
  it('wraps every portal screen', () => {
    const roots = shell.match(/className="[^"]*min-h-screen[^"]*"/g) ?? []
    expect(roots.length).toBe(3)
    for (const r of roots) expect(r).toContain('portal-light')
  })
  it('spinner uses the primary token', () => {
    expect(shell).not.toContain('border-[#556b2f]')
  })
})
