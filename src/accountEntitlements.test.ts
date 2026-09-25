import { describe, expect, it } from 'vitest'
import { accountCanUse, familyCanSync, familyCanUse, memberCanUse, resolveFamilySyncAccess } from './accountEntitlements'
import type { AccountAccessState, FamilyMembershipState } from './accountEntitlements'

const familyId = 'fam_one'

function account(accountId: string, activeFeatures: AccountAccessState['activeFeatures'] = []): AccountAccessState {
  return { accountId, activeFeatures }
}

function member(
  accountId: string,
  activeFeatures: FamilyMembershipState['activeFeatures'] = [],
  overrides: Partial<FamilyMembershipState> = {}
): FamilyMembershipState {
  return { accountId, familyId, status: 'ACTIVE', activeFeatures, ...overrides }
}

describe('account and family entitlement state', () => {
  it('requires sign-in and an active membership before Family Sync can run', () => {
    expect(resolveFamilySyncAccess({ account: null, membership: null, familyMembers: [] })).toEqual({
      status: 'SIGNED_OUT', canSync: false
    })

    const freeAccount = account('acc_free')
    expect(resolveFamilySyncAccess({ account: freeAccount, membership: null, familyMembers: [] })).toEqual({
      status: 'NO_ACTIVE_MEMBERSHIP', canSync: false
    })
  })

  it('keeps a Free plus Free family paused without deleting membership', () => {
    const current = account('acc_free_a')
    const currentMembership = member(current.accountId)
    const familyMembers = [currentMembership, member('acc_free_b')]

    expect(resolveFamilySyncAccess({ account: current, membership: currentMembership, familyMembers })).toEqual({
      status: 'PAUSED', canSync: false, familyId
    })
  })

  it('allows every active member to sync when one Family member funds it', () => {
    const freeAccount = account('acc_free')
    const freeMembership = member(freeAccount.accountId)
    const familyMembers = [freeMembership, member('acc_family', ['FAMILY_SYNC', 'PDF_EXPORT'])]

    expect(familyCanSync(familyId, familyMembers)).toBe(true)
    expect(resolveFamilySyncAccess({ account: freeAccount, membership: freeMembership, familyMembers })).toEqual({
      status: 'ACTIVE', canSync: true, familyId
    })
  })

  it('shares Family+ Insights with every active family member', () => {
    const freeAccount = account('acc_free')
    const familyPlusAccount = account('acc_plus', ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'])
    const freeMembership = member(freeAccount.accountId)
    const familyMembers = [freeMembership, member(familyPlusAccount.accountId, familyPlusAccount.activeFeatures)]

    expect(resolveFamilySyncAccess({ account: freeAccount, membership: freeMembership, familyMembers }).canSync).toBe(true)
    expect(accountCanUse('FAMILY_PLUS_INSIGHTS', freeAccount)).toBe(false)
    expect(accountCanUse('FAMILY_PLUS_INSIGHTS', familyPlusAccount)).toBe(true)
    expect(familyCanUse('FAMILY_PLUS_INSIGHTS', familyId, familyMembers)).toBe(true)
    expect(memberCanUse('FAMILY_PLUS_INSIGHTS', freeAccount, freeMembership, familyMembers)).toBe(true)
  })

  it('does not inherit Family+ Insights from an inactive or unrelated payer', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const formerPayer = member('acc_left', ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'], { status: 'LEFT' })
    const otherFamilyPayer = member('acc_other', ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'], { familyId: 'fam_other' })

    expect(memberCanUse('FAMILY_PLUS_INSIGHTS', current, currentMembership,
      [currentMembership, formerPayer, otherFamilyPayer])).toBe(false)
  })

  it('keeps Family access but removes Plus when the last active Plus contribution ends', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const familyPayer = member('acc_family', ['FAMILY_SYNC', 'PDF_EXPORT'])
    const formerPlusPayer = member('acc_plus', ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'], { status: 'LEFT' })
    const familyMembers = [currentMembership, familyPayer, formerPlusPayer]

    expect(memberCanUse('FAMILY_SYNC', current, currentMembership, familyMembers)).toBe(true)
    expect(memberCanUse('PDF_EXPORT', current, currentMembership, familyMembers)).toBe(true)
    expect(memberCanUse('FAMILY_PLUS_INSIGHTS', current, currentMembership, familyMembers)).toBe(false)
  })

  it('pauses sync when the last paying entitlement expires while retaining members', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const expiredPayerMembership = member('acc_expired')
    const familyMembers = [currentMembership, expiredPayerMembership]

    expect(familyMembers).toHaveLength(2)
    expect(resolveFamilySyncAccess({ account: current, membership: currentMembership, familyMembers }).status).toBe('PAUSED')
  })

  it('ignores inactive payers and entitlements from another family', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const inactivePayer = member('acc_left', ['FAMILY_SYNC'], { status: 'LEFT' })
    const otherFamilyPayer = member('acc_other', ['FAMILY_SYNC'], { familyId: 'fam_other' })

    expect(familyCanSync(familyId, [currentMembership, inactivePayer, otherFamilyPayer])).toBe(false)
  })

  it('keeps sync active when one payer leaves but another active payer remains', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const formerPayer = member('acc_left', ['FAMILY_SYNC'], { status: 'LEFT' })
    const activePayer = member('acc_active', ['FAMILY_SYNC'])

    expect(resolveFamilySyncAccess({
      account: current,
      membership: currentMembership,
      familyMembers: [currentMembership, formerPayer, activePayer]
    })).toEqual({ status: 'ACTIVE', canSync: true, familyId })
  })

  it('requires reconciliation before a previously paused family resumes writes', () => {
    const current = account('acc_free')
    const currentMembership = member(current.accountId)
    const familyMembers = [currentMembership, member('acc_family', ['FAMILY_SYNC'])]

    expect(resolveFamilySyncAccess({
      account: current,
      membership: currentMembership,
      familyMembers,
      reconciliationRequired: true
    })).toEqual({ status: 'RECONCILIATION_REQUIRED', canSync: false, familyId })
  })
})
