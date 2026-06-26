import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from './origin-allowlist'

const list = ['https://sys.wolthers.com', 'https://*.vercel.app']

describe('isAllowedOrigin', () => {
  it('exact origin allowed', () => {
    expect(isAllowedOrigin('https://sys.wolthers.com', list)).toBe(true)
  })

  it('wildcard subdomain allowed', () => {
    expect(isAllowedOrigin('https://wolthers-app-abc123.vercel.app', list)).toBe(true)
  })

  it('foreign origin denied', () => {
    expect(isAllowedOrigin('https://evil.com', list)).toBe(false)
  })

  it('partial host not allowed', () => {
    expect(isAllowedOrigin('https://sys.wolthers.com.evil.com', list)).toBe(false)
  })

  it('wildcard does not span dots', () => {
    expect(isAllowedOrigin('https://a.b.vercel.app', list)).toBe(false)
  })
})
