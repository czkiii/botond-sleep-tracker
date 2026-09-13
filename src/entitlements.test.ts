import { describe, expect, it } from 'vitest'
import { canUseFamilySync, canUsePremiumInsights, parseProductPlan } from './entitlements'

describe('product entitlements', () => {
  it('keeps the Free plan local-only without premium access', () => {
    expect(canUseFamilySync('free')).toBe(false)
    expect(canUsePremiumInsights('free')).toBe(false)
  })

  it('gives Family sync without personal Family+ insights', () => {
    expect(canUseFamilySync('family')).toBe(true)
    expect(canUsePremiumInsights('family')).toBe(false)
  })

  it('gives the subscriber Family sync and personal Family+ insights', () => {
    expect(canUseFamilySync('familyPlus')).toBe(true)
    expect(canUsePremiumInsights('familyPlus')).toBe(true)
  })

  it('rejects unknown preview-plan values', () => {
    expect(parseProductPlan('familyPlus')).toBe('familyPlus')
    expect(parseProductPlan('premium')).toBeNull()
    expect(parseProductPlan(null)).toBeNull()
  })
})
