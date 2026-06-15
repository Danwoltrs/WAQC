import { describe, it, expect } from 'vitest'
import { evaluateDefectAgainstRules, type TaintFaultValidationRules } from './taint-fault-configuration'

describe('evaluateDefectAgainstRules', () => {
  it('zero_tolerance rejects any defect, taint or fault', () => {
    const rules: TaintFaultValidationRules = { zero_tolerance: true }
    expect(evaluateDefectAgainstRules(rules, true).outOfSpec).toBe(true)
    expect(evaluateDefectAgainstRules(rules, false).outOfSpec).toBe(true)
    expect(evaluateDefectAgainstRules(rules, true).reason).toContain('zero tolerance')
  })

  it('a fault is out of spec when max_faults is 0', () => {
    const rules: TaintFaultValidationRules = { max_taints: 2, max_faults: 0 }
    const r = evaluateDefectAgainstRules(rules, false)
    expect(r.outOfSpec).toBe(true)
    expect(r.reason).toContain('fault')
  })

  it('a taint passes when faults are disallowed but taints are allowed (the Dunkin past-crop bug)', () => {
    const rules: TaintFaultValidationRules = { max_taints: 2, max_faults: 0 }
    expect(evaluateDefectAgainstRules(rules, true).outOfSpec).toBe(false)
  })

  it('a taint is out of spec when max_taints is 0', () => {
    const rules: TaintFaultValidationRules = { max_taints: 0, max_faults: 1 }
    expect(evaluateDefectAgainstRules(rules, true).outOfSpec).toBe(true)
  })

  it('a fault passes when faults are allowed', () => {
    const rules: TaintFaultValidationRules = { max_taints: 2, max_faults: 1 }
    expect(evaluateDefectAgainstRules(rules, false).outOfSpec).toBe(false)
  })

  it('no rules / undefined limits never categorically reject', () => {
    expect(evaluateDefectAgainstRules({}, true).outOfSpec).toBe(false)
    expect(evaluateDefectAgainstRules({}, false).outOfSpec).toBe(false)
    expect(evaluateDefectAgainstRules(undefined, false).outOfSpec).toBe(false)
  })
})
