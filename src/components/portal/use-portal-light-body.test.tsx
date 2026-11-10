import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { usePortalLightBody } from './use-portal-light-body'

function Probe() {
  usePortalLightBody()
  return null
}

describe('usePortalLightBody', () => {
  it('puts portal-light on body while mounted and removes it on unmount', () => {
    expect(document.body.classList.contains('portal-light')).toBe(false)
    const { unmount } = render(<Probe />)
    expect(document.body.classList.contains('portal-light')).toBe(true)
    unmount()
    expect(document.body.classList.contains('portal-light')).toBe(false)
  })
})
