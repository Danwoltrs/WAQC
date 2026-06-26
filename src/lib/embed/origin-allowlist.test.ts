import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from './origin-allowlist'

// Production-only allowlist (mirrors EMBED_PARENT_ALLOWLIST in production: no localhost, no vercel.app)
const prodList = ['https://sys.wolthers.com']

// Dev allowlist (mirrors EMBED_PARENT_ALLOWLIST in non-production)
const devList = ['https://sys.wolthers.com', 'http://localhost:3000', 'http://localhost:3001']

describe('isAllowedOrigin — production list', () => {
  it('sys.wolthers.com exact match allowed', () => {
    expect(isAllowedOrigin('https://sys.wolthers.com', prodList)).toBe(true)
  })

  it('vercel.app origin is denied in production', () => {
    expect(isAllowedOrigin('https://wolthers-app-abc123.vercel.app', prodList)).toBe(false)
  })

  it('foreign origin denied', () => {
    expect(isAllowedOrigin('https://evil.com', prodList)).toBe(false)
  })

  it('partial host suffix bypass denied', () => {
    expect(isAllowedOrigin('https://sys.wolthers.com.evil.com', prodList)).toBe(false)
  })

  it('localhost denied in production', () => {
    expect(isAllowedOrigin('http://localhost:3000', prodList)).toBe(false)
  })
})

describe('isAllowedOrigin — dev list', () => {
  it('sys.wolthers.com allowed in dev', () => {
    expect(isAllowedOrigin('https://sys.wolthers.com', devList)).toBe(true)
  })

  it('localhost:3000 allowed in dev', () => {
    expect(isAllowedOrigin('http://localhost:3000', devList)).toBe(true)
  })

  it('localhost:3001 allowed in dev', () => {
    expect(isAllowedOrigin('http://localhost:3001', devList)).toBe(true)
  })

  it('vercel.app origin denied even in dev', () => {
    expect(isAllowedOrigin('https://wolthers-app-abc123.vercel.app', devList)).toBe(false)
  })

  it('foreign origin denied in dev', () => {
    expect(isAllowedOrigin('https://evil.com', devList)).toBe(false)
  })
})
