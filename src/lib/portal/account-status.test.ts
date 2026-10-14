// src/lib/portal/account-status.test.ts
import { describe, expect, it } from 'vitest'
import { PENDING_SYS_INVITATION, SWITCHED_OFF, accountStatusRefusal } from './account-status'

describe('accountStatusRefusal', () => {
  it('refuses switched-off and sys-invited accounts, and nothing else', () => {
    expect(accountStatusRefusal('disabled')).toBe(SWITCHED_OFF)
    expect(accountStatusRefusal('invited')).toBe(PENDING_SYS_INVITATION)
    for (const status of ['active', 'pending', null, undefined]) expect(accountStatusRefusal(status)).toBeNull()
  })
})
